import L from 'leaflet';
import { useEffect } from 'react';
import type { Point } from '../../shared/schema.ts';
import { useMap } from './MapContext.ts';

export interface Trail {
  /** Points of the route in map-picture pixels. */
  points: Point[];
  color: string;
  /** "recent" = this episode's movement (dotted, strong); "journey" = everything before (thin, faint). */
  kind: 'recent' | 'journey';
}

/** Draws the routes characters have travelled as lines under the markers. */
export function TrailLayer({ trails }: { trails: Trail[] }) {
  const { map, toLatLng } = useMap();

  useEffect(() => {
    const renderer = L.svg({ pane: 'trails', padding: 0.5 });
    const group = L.layerGroup().addTo(map);
    // Several characters travelling together would draw the same line many times: draw each distinct line once.
    const seen = new Set<string>();
    for (const trail of trails) {
      if (trail.points.length < 2) continue;
      const key = `${trail.kind}|${trail.color}|${trail.points.map((point) => point.join(',')).join(' ')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const line = trail.points.map(toLatLng);
      const common = { renderer, pane: 'trails', interactive: false, lineCap: 'round', lineJoin: 'round' } as const;
      if (trail.kind === 'journey') {
        L.polyline(line, { ...common, color: trail.color, weight: 2.5, opacity: 0.5 }).addTo(group);
      } else {
        // a pale casing underneath keeps the dotted line readable on dark and light parts of the map
        L.polyline(line, { ...common, color: '#fff8e7', weight: 6, opacity: 0.55 }).addTo(group);
        L.polyline(line, { ...common, color: trail.color, weight: 3.5, opacity: 0.95, dashArray: '1 8' }).addTo(group);
      }
    }
    return () => {
      group.remove();
      renderer.remove();
    };
  }, [map, toLatLng, trails]);

  return null;
}
