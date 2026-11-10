import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { MapDef, Point } from '../../shared/schema.ts';
import { useStore } from '../store.ts';
import { MapContext } from './MapContext.ts';
import type { MapApi } from './MapContext.ts';

/** A 1x1 picture of a single colour, stretched under the map as "paper". */
function colourPixel(colour: string): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="${colour}"/></svg>`)}`;
}

/** How much of the map view is covered by panels (elements marked with data-map-inset="left|right|top|bottom"). */
function coveredEdges(container: HTMLElement) {
  const box = container.getBoundingClientRect();
  const covered = { top: 0, right: 0, bottom: 0, left: 0 };
  document.querySelectorAll<HTMLElement>('[data-map-inset]').forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    switch (element.dataset.mapInset) {
      case 'top':
        covered.top = Math.max(covered.top, rect.bottom - box.top);
        break;
      case 'bottom':
        covered.bottom = Math.max(covered.bottom, box.bottom - rect.top);
        break;
      case 'left':
        covered.left = Math.max(covered.left, rect.right - box.left);
        break;
      case 'right':
        covered.right = Math.max(covered.right, box.right - rect.left);
        break;
    }
  });
  return covered;
}

interface Props {
  mapDef: MapDef;
  /** Where to open the map; the whole map is shown when left out. */
  initialView?: { center: Point; zoom: number };
  children?: ReactNode;
}

export function MapView({ mapDef, initialView, children }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<MapApi | null>(null);
  const tint = useStore((state) => state.options.tint);
  const camera = useStore((state) => state.camera);

  useEffect(() => {
    const element = container.current!;
    const maxZoom = mapDef.tiles.maxZoom;
    const map = L.map(element, {
      crs: L.CRS.Simple,
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 100,
      maxZoom: maxZoom + 1,
      maxBoundsViscosity: 0.85,
      bounceAtZoomLimits: false,
    });

    const toLatLng = (point: Point) => map.unproject(L.point(point[0], point[1]), maxZoom);
    const toPoint = (latLng: L.LatLng): Point => {
      const projected = map.project(latLng, maxZoom);
      return [Math.round(projected.x), Math.round(projected.y)];
    };
    const bounds = L.latLngBounds(toLatLng([0, mapDef.height]), toLatLng([mapDef.width, 0]));

    // "Paper" under the map: with the tint switched on, the map picture is blended into this colour.
    map.createPane('paper').style.zIndex = '150';
    if (mapDef.tint) L.imageOverlay(colourPixel(mapDef.tint), bounds, { pane: 'paper', interactive: false }).addTo(map);

    L.tileLayer(`/media/${mapDef.tiles.path}/{z}/{y}/{x}.${mapDef.tiles.ext}`, {
      tileSize: mapDef.tiles.size,
      minZoom: -2,
      maxNativeZoom: maxZoom,
      maxZoom: maxZoom + 1,
      bounds,
      noWrap: true,
      keepBuffer: 4,
    }).addTo(map);

    // Allow dragging a good way past the edges, so any corner can be moved out from under the panels.
    map.setMaxBounds(bounds.pad(0.45));
    const fitMinZoom = () => map.setMinZoom(map.getBoundsZoom(bounds, false) - 0.5);
    fitMinZoom();
    map.on('resize', fitMinZoom);

    if (initialView) map.setView(toLatLng(initialView.center), initialView.zoom, { animate: false });
    else map.fitBounds(bounds, { animate: false });

    setApi({ map, maxZoom, toLatLng, toPoint });
    return () => {
      setApi(null);
      map.remove();
    };
    // The map is rebuilt only when a different map picture is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapDef]);

  // Bring a requested point into the part of the map that is not covered by panels.
  useEffect(() => {
    if (!api || !camera || !container.current) return;
    const { map } = api;
    const target = api.toLatLng(camera.point);
    const zoom = Math.max(map.getZoom(), camera.minZoom ?? api.maxZoom - 2.5);
    const covered = coveredEdges(container.current);
    const size = map.getSize();

    const onScreen = map.latLngToContainerPoint(target);
    const margin = 70;
    const visible =
      zoom === map.getZoom() &&
      onScreen.x > covered.left + margin &&
      onScreen.x < size.x - covered.right - margin &&
      onScreen.y > covered.top + margin &&
      onScreen.y < size.y - covered.bottom - margin;
    if (visible) return;

    const shift = L.point((covered.left - covered.right) / 2, (covered.top - covered.bottom) / 2);
    const centre = map.unproject(map.project(target, zoom).subtract(shift), zoom);
    map.flyTo(centre, zoom, { duration: 0.9, easeLinearity: 0.3 });
  }, [api, camera]);

  return (
    <div
      ref={container}
      className={`map${tint && mapDef.tint ? ' map--tinted' : ''}`}
      style={{ background: mapDef.background ?? '#2b241c' }}
    >
      {api && <MapContext.Provider value={api}>{children}</MapContext.Provider>}
    </div>
  );
}
