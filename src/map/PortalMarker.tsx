import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Point } from '../../shared/schema.ts';
import { pathLength, pointAlong } from '../../shared/timeline.ts';
import { useMap } from './MapContext.ts';

interface Props {
  /** Position in map-picture pixels. */
  pos: Point;
  /** Shift in screen pixels, used to spread out markers that would overlap. */
  offset?: [number, number];
  /** Which map layer the marker sits in ("history", "characters", "events"). */
  pane: string;
  /** Raises the marker above its neighbours in the same layer. */
  raised?: boolean;
  /**
   * When the position changes and this route (ending at the new position) is given,
   * the marker travels along it instead of jumping.
   */
  route?: Point[];
  children: ReactNode;
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * A map marker whose content is ordinary React. Leaflet keeps it glued to the
 * right spot while the map moves and zooms; React renders what is inside.
 */
export function PortalMarker({ pos, offset, pane, raised = false, route, children }: Props) {
  const { map, toLatLng } = useMap();
  const [element] = useState(() => {
    const created = document.createElement('div');
    created.className = 'pm';
    // Clicks on a marker belong to the marker: they must not drag or click the map underneath.
    L.DomEvent.disableClickPropagation(created);
    return created;
  });
  const marker = useRef<L.Marker | null>(null);
  const latestRoute = useRef(route);
  latestRoute.current = route;
  const [x, y] = pos;

  useEffect(() => {
    const created = L.marker(toLatLng([x, y]), {
      icon: L.divIcon({ html: element, className: 'pm-anchor', iconSize: [0, 0] }),
      interactive: false,
      keyboard: false,
      pane,
    }).addTo(map);
    marker.current = created;
    return () => {
      created.remove();
      marker.current = null;
    };
    // The marker is created once; later position changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, element, pane]);

  useEffect(() => {
    const target = marker.current;
    if (!target) return;
    const path = latestRoute.current;
    if (!path || path.length < 2 || prefersReducedMotion()) {
      target.setLatLng(toLatLng([x, y]));
      return;
    }
    // Longer journeys take longer, within reason.
    const duration = Math.min(2600, 700 + pathLength(path) / 3);
    const started = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, (now - started) / duration);
      target.setLatLng(toLatLng(pointAlong(path, easeInOut(progress))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      target.setLatLng(toLatLng([x, y]));
    };
  }, [x, y, toLatLng]);

  useEffect(() => {
    marker.current?.setZIndexOffset(raised ? 100000 : 0);
  }, [raised]);

  return createPortal(
    <div className="pm__shift" style={{ transform: `translate(${offset?.[0] ?? 0}px, ${offset?.[1] ?? 0}px)` }}>
      {children}
    </div>,
    element,
  );
}
