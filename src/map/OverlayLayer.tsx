import L from 'leaflet';
import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import type { Overlay, Point } from '../../shared/schema.ts';
import { EVENT_ICONS } from '../components/icons.tsx';
import { useStore } from '../store.ts';
import { useMap } from './MapContext.ts';
import { PortalMarker } from './PortalMarker.tsx';
import { useMapScale } from './useMapScale.ts';

const DEFAULT_COLOUR = '#5b4a36';

/** Where the title of an overlay sits: on its point, in the middle of its region, or halfway along its line. */
function anchor(overlay: Overlay): Point {
  const { points } = overlay;
  if (overlay.kind === 'region') {
    return [Math.round(points.reduce((sum, point) => sum + point[0], 0) / points.length), Math.round(points.reduce((sum, point) => sum + point[1], 0) / points.length)];
  }
  return overlay.kind === 'line' ? points[Math.floor(points.length / 2)] : points[0];
}

/**
 * The changing world: regions, lines, labels and symbols that appear and
 * disappear as the story goes on (the list given here is already filtered by time).
 */
export function OverlayLayer({ overlays }: { overlays: Overlay[] }) {
  const { map, toLatLng } = useMap();
  const select = useStore((state) => state.select);
  const selectedId = useStore((state) => (state.selection?.kind === 'overlay' ? state.selection.id : null));
  // Zoomed far out there is no room for words: labels shrink to a small symbol and show their text on hover.
  const compact = useMapScale() < 0.2;

  useEffect(() => {
    const renderer = L.svg({ pane: 'trails', padding: 0.5 });
    const group = L.layerGroup().addTo(map);
    for (const overlay of overlays) {
      const color = overlay.color ?? DEFAULT_COLOUR;
      const shape = overlay.points.map(toLatLng);
      const common = { renderer, pane: 'trails', interactive: false, color, lineJoin: 'round' } as const;
      if (overlay.kind === 'region') {
        L.polygon(shape, { ...common, weight: 2.5, opacity: 0.75, dashArray: overlay.dashed ? '8 7' : undefined, fillColor: color, fillOpacity: 0.2 }).addTo(group);
      } else if (overlay.kind === 'line') {
        L.polyline(shape, { ...common, weight: 5, opacity: 0.7, dashArray: overlay.dashed ? '10 9' : undefined, lineCap: 'round' }).addTo(group);
      }
    }
    return () => {
      group.remove();
      renderer.remove();
    };
  }, [map, toLatLng, overlays]);

  return (
    <>
      {overlays.map((overlay) => {
        const Icon = EVENT_ICONS[overlay.icon ?? (overlay.kind === 'line' ? 'journey' : overlay.kind === 'marker' ? 'star' : 'omen')].icon;
        const withIcon = overlay.kind === 'marker' || compact;
        const style = { '--c': overlay.color ?? DEFAULT_COLOUR, fontSize: `${(overlay.scale ?? 1) * 0.82}rem` } as CSSProperties;
        return (
          <PortalMarker key={overlay.id} pos={anchor(overlay)} pane="history" raised={overlay.id === selectedId}>
            <button
              type="button"
              className={`world-label world-label--${overlay.kind}${compact ? ' is-compact' : ''}${overlay.id === selectedId ? ' is-selected' : ''}`}
              aria-label={overlay.title}
              style={style}
              onClick={() => select({ kind: 'overlay', id: overlay.id })}
            >
              {withIcon && (
                <span className="world-label__icon">
                  <Icon aria-hidden="true" />
                </span>
              )}
              <span className="world-label__text">{overlay.title}</span>
            </button>
          </PortalMarker>
        );
      })}
    </>
  );
}
