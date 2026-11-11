import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { Point } from '../../shared/schema.ts';
import { characterPath } from '../../shared/timeline.ts';
import type { Time, TimedEvent } from '../../shared/timeline.ts';
import { iconFor } from '../components/icons.tsx';
import { Portrait } from '../components/Picture.tsx';
import { buildTrails, declutter, storylineColor } from '../scene.ts';
import { useScene } from '../useScene.ts';
import type { HistorySpot, LayoutItem, SceneCharacter } from '../scene.ts';
import { useStore } from '../store.ts';
import { OverlayLayer } from './OverlayLayer.tsx';
import { PortalMarker } from './PortalMarker.tsx';
import { TrailLayer } from './TrailLayer.tsx';
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

function CharacterPin({ entry, selected, onSelect }: { entry: SceneCharacter; selected: boolean; onSelect: () => void }) {
  const classes = ['who-pin'];
  if (selected) classes.push('is-selected');
  if (entry.followed) classes.push('is-followed');
  return (
    <button type="button" className={classes.join(' ')} onClick={onSelect} aria-label={entry.identity.name} aria-pressed={selected}>
      <Portrait image={entry.identity.image} name={entry.identity.name} size={30} color={entry.color} />
      <span className="pin__label">{entry.identity.name}</span>
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
  const trailMode = useStore((state) => state.options.trails);
  const showOverlays = useStore((state) => state.options.overlays);
  const followed = useStore((state) => state.followed);
  const scale = useMapScale();

  const offsets = useMemo(() => {
    const items: LayoutItem[] = [
      ...(scene?.current ?? []).map((timed) => ({ id: `event:${timed.event.id}`, kind: 'event' as const, pos: timed.pos! })),
      ...(scene?.characters ?? []).map((entry) => ({ id: `character:${entry.character.id}`, kind: 'character' as const, pos: entry.pos })),
    ];
    return declutter(items, scale);
  }, [scene, scale]);

  // When time moves, portraits travel along the route between where they were and where they are now.
  const previousTime = useRef<Time | null>(null);
  const routes = useMemo(() => {
    const found = new Map<string, Point[]>();
    const from = previousTime.current;
    if (!scene || !timeline || !from || (from.ep === scene.time.ep && from.ord === scene.time.ord)) return found;
    for (const entry of scene.characters) {
      const route = characterPath(timeline, entry.character.id, from, scene.time).at(-1);
      const end = route?.at(-1);
      if (route && end && end[0] === entry.pos[0] && end[1] === entry.pos[1]) found.set(entry.character.id, route);
    }
    return found;
  }, [scene, timeline]);
  useEffect(() => {
    if (scene) previousTime.current = scene.time;
  }, [scene]);

  const trails = useMemo(
    () => (scene && bundle && timeline ? buildTrails(bundle, timeline, scene, trailMode, followed) : []),
    [scene, bundle, timeline, trailMode, followed],
  );

  if (!scene || !bundle || !timeline) return null;

  const selectedEventId = selection?.kind === 'event' ? selection.id : null;
  const selectedElsewhere =
    selectedEventId && !scene.current.some((timed) => timed.event.id === selectedEventId) ? timeline.eventById.get(selectedEventId) : undefined;
  const selectedPlace = selection?.kind === 'place' ? timeline.placeById.get(selection.id) : undefined;
  const selectedCharacterId = selection?.kind === 'character' ? selection.id : null;

  return (
    <>
      {showOverlays && <OverlayLayer overlays={scene.overlays} />}
      <TrailLayer trails={trails} />

      {scene.characters.map((entry) => (
        <PortalMarker
          key={`character:${entry.character.id}`}
          pos={entry.pos}
          offset={offsets.get(`character:${entry.character.id}`)}
          pane="characters"
          raised={entry.character.id === selectedCharacterId}
          route={routes.get(entry.character.id)}
        >
          <CharacterPin entry={entry} selected={entry.character.id === selectedCharacterId} onSelect={() => select({ kind: 'character', id: entry.character.id })} />
        </PortalMarker>
      ))}

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
        <PortalMarker key={timed.event.id} pos={timed.pos!} offset={offsets.get(`event:${timed.event.id}`)} pane="events" raised={timed.event.id === selectedEventId}>
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
