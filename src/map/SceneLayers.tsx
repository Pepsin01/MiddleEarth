import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { TimedEvent } from '../../shared/timeline.ts';
import { iconFor } from '../components/icons.tsx';
import { declutter, storylineColor, useScene } from '../scene.ts';
import type { HistorySpot, LayoutItem } from '../scene.ts';
import { useStore } from '../store.ts';
import { PortalMarker } from './PortalMarker.tsx';
import { useMapScale } from './useMapScale.ts';

interface EventPinProps {
  timed: TimedEvent;
  color: string;
  selected: boolean;
  /** An event from an earlier episode, shown because it is selected. */
  past?: boolean;
  onSelect: () => void;
}

export function EventPin({ timed, color, selected, past = false, onSelect }: EventPinProps) {
  const { event } = timed;
  const Icon = iconFor(event);
  const classes = ['pin', `pin--${event.importance}`];
  if (selected) classes.push('is-selected');
  if (past) classes.push('pin--past');
  if (event.flashback) classes.push('pin--flashback');
  return (
    <button type="button" className={classes.join(' ')} style={{ '--c': color } as CSSProperties} onClick={onSelect} aria-label={event.title} aria-pressed={selected}>
      <Icon aria-hidden="true" />
      <span className="pin__label">
        {past && <em>{timed.episode.code} · </em>}
        {event.title}
      </span>
    </button>
  );
}

function HistoryDot({ spot, onSelect }: { spot: HistorySpot; onSelect: () => void }) {
  const latest = spot.events[spot.events.length - 1];
  const title = spot.place ? spot.place.name : latest.event.title;
  return (
    <button type="button" className="dot" style={{ '--c': spot.color } as CSSProperties} onClick={onSelect} aria-label={`Earlier: ${title}`}>
      <span className="pin__label">
        <em>{spot.events.length === 1 ? latest.episode.code : `${spot.events.length} earlier events`} · </em>
        {title}
      </span>
    </button>
  );
}

/** Everything the story puts on the map at the current moment. */
export function SceneLayers() {
  const scene = useScene();
  const bundle = useStore((state) => state.bundle);
  const timeline = useStore((state) => state.timeline);
  const selection = useStore((state) => state.selection);
  const select = useStore((state) => state.select);
  const showPlaces = useStore((state) => state.options.places);
  const scale = useMapScale();

  const offsets = useMemo(() => {
    const items: LayoutItem[] = (scene?.current ?? []).map((timed) => ({ id: timed.event.id, kind: 'event', pos: timed.pos! }));
    return declutter(items, scale);
  }, [scene, scale]);

  if (!scene || !bundle || !timeline) return null;

  const selectedEventId = selection?.kind === 'event' ? selection.id : null;
  const selectedElsewhere =
    selectedEventId && !scene.current.some((timed) => timed.event.id === selectedEventId) ? timeline.eventById.get(selectedEventId) : undefined;
  const selectedPlace = selection?.kind === 'place' ? timeline.placeById.get(selection.id) : undefined;

  return (
    <>
      {showPlaces &&
        bundle.places.map((place) => (
          <PortalMarker key={`place-pin:${place.id}`} pos={place.pos} pane="history">
            <button type="button" className="place-pin" onClick={() => select({ kind: 'place', id: place.id })}>
              {place.name}
            </button>
          </PortalMarker>
        ))}

      {scene.history.map((spot) => (
        <PortalMarker key={`history:${spot.key}`} pos={spot.pos} pane="history">
          <HistoryDot
            spot={spot}
            onSelect={() => select(spot.place ? { kind: 'place', id: spot.place.id } : { kind: 'event', id: spot.events[spot.events.length - 1].event.id })}
          />
        </PortalMarker>
      ))}

      {selectedPlace && (
        <PortalMarker key={`place:${selectedPlace.id}`} pos={selectedPlace.pos} pane="history" raised>
          <span className="place-ring" aria-hidden="true" />
        </PortalMarker>
      )}

      {scene.current.map((timed) => (
        <PortalMarker key={timed.event.id} pos={timed.pos!} offset={offsets.get(timed.event.id)} pane="events" raised={timed.event.id === selectedEventId}>
          <EventPin
            timed={timed}
            color={storylineColor(bundle, timed.event.storylineId)}
            selected={timed.event.id === selectedEventId}
            onSelect={() => select({ kind: 'event', id: timed.event.id })}
          />
        </PortalMarker>
      ))}

      {selectedElsewhere?.pos && (
        <PortalMarker key={`selected:${selectedElsewhere.event.id}`} pos={selectedElsewhere.pos} pane="events" raised>
          <EventPin
            timed={selectedElsewhere}
            color={storylineColor(bundle, selectedElsewhere.event.storylineId)}
            selected
            past
            onSelect={() => select({ kind: 'event', id: selectedElsewhere.event.id })}
          />
        </PortalMarker>
      )}
    </>
  );
}
