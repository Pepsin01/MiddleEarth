import type L from 'leaflet';
import { useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useMap } from '../map/MapContext.ts';
import { PortalMarker } from '../map/PortalMarker.tsx';
import { TrailLayer } from '../map/TrailLayer.tsx';
import type { Trail } from '../scene.ts';
import { useStore } from '../store.ts';

/**
 * Editing on the map: while a form asks for a position or route points, the next
 * click on the map delivers it; the entry being edited is drawn as a draft marker.
 */
export function PickLayer() {
  const { map, toPoint } = useMap();
  const pick = useStore((state) => state.pick);
  const setPick = useStore((state) => state.setPick);
  const draft = useStore((state) => state.draftShape);

  useEffect(() => {
    if (!pick) return;
    const container = map.getContainer();
    container.classList.add('is-picking');
    const onClick = (event: L.LeafletMouseEvent) => useStore.getState().mapPicked(toPoint(event.latlng));
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
      container.classList.remove('is-picking');
    };
  }, [map, pick, toPoint]);

  const route = useMemo<Trail[]>(() => {
    if (!draft?.via?.length) return [];
    return [{ points: draft.pos ? [...draft.via, draft.pos] : draft.via, color: draft.color, kind: 'recent' }];
  }, [draft]);

  return (
    <>
      <TrailLayer trails={route} />
      {draft?.via?.map((point, index) => (
        <PortalMarker key={`via:${index}:${point.join(',')}`} pos={point} pane="events">
          <span className="draft-via">{index + 1}</span>
        </PortalMarker>
      ))}
      {draft?.pos && (
        <PortalMarker key="draft" pos={draft.pos} pane="events" raised>
          <span className="draft-pin" style={{ '--c': draft.color } as CSSProperties} />
        </PortalMarker>
      )}
      {pick && (
        <div className="panel pick-hint" role="status">
          {pick === 'pos' ? 'Click the map where it happens.' : 'Click the map to add route points, in the order they are passed.'}
          <button type="button" className="button" onClick={() => setPick(null)}>
            {pick === 'via' ? 'Done' : 'Cancel'}
          </button>
        </div>
      )}
    </>
  );
}
