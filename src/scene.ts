/**
 * Works out what the map should show for the current position of the time
 * slider: which events, which characters and where, which overlays.
 * Pure logic only - the React hook that feeds it from the app state is in useScene.ts.
 */
import type { Character, ImageRef, Overlay, Place, Point, SagaBundle } from '../shared/schema.ts';
import { characterAt, cursorTime, identityAt, isAtOrBefore, isBefore, overlayVisible } from '../shared/timeline.ts';
import type { EpisodeRef, Identity, Stop, Time, TimedEvent, Timeline } from '../shared/timeline.ts';

export interface SceneCharacter {
  character: Character;
  /** Name, picture and colour as known at this moment (identity reveals applied). */
  identity: Identity;
  pos: Point;
  stop: Stop;
  color: string;
  followed: boolean;
}

/** Earlier events at one spot, drawn as a single faded dot. */
export interface HistorySpot {
  key: string;
  pos: Point;
  events: TimedEvent[];
  place?: Place;
  color: string;
}

export interface Scene {
  time: Time;
  episode: EpisodeRef;
  /** Events of the current episode that have happened by now, in story order. */
  current: TimedEvent[];
  history: HistorySpot[];
  characters: SceneCharacter[];
  overlays: Overlay[];
}

const NEUTRAL = '#6b5b45';

export function storylineColor(bundle: SagaBundle, storylineId: string | undefined): string {
  return bundle.saga.storylines.find((storyline) => storyline.id === storylineId)?.color ?? NEUTRAL;
}

export function buildScene(
  bundle: SagaBundle,
  timeline: Timeline,
  episodeId: string,
  stepEventId: string | null,
  hiddenStorylines: string[],
  followed: string[],
  showHistory: boolean,
): Scene | null {
  const episode = timeline.episodeById.get(episodeId);
  if (!episode) return null;
  const time = cursorTime(timeline, episodeId, stepEventId);
  const visible = (timed: TimedEvent) => !hiddenStorylines.includes(timed.event.storylineId) && timed.pos !== undefined;

  const current = (timeline.eventsByEpisode.get(episodeId) ?? []).filter((timed) => visible(timed) && isAtOrBefore(timed.time, time));

  const spots = new Map<string, HistorySpot>();
  if (showHistory) {
    for (const timed of timeline.events) {
      if (timed.time.ep >= episode.index) break;
      if (!visible(timed)) continue;
      const pos = timed.pos!;
      const key = `${pos[0]},${pos[1]}`;
      const spot = spots.get(key);
      if (spot) spot.events.push(timed);
      else spots.set(key, { key, pos, events: [timed], place: timed.place, color: storylineColor(bundle, timed.event.storylineId) });
    }
  }

  const characters: SceneCharacter[] = [];
  for (const character of bundle.characters) {
    const state = characterAt(timeline, character.id, time);
    if (!state) continue;
    const identity = identityAt(timeline, character, time);
    if (identity.storylineId && hiddenStorylines.includes(identity.storylineId)) continue;
    characters.push({
      character,
      identity,
      pos: state.pos,
      stop: state.stop,
      color: storylineColor(bundle, identity.storylineId),
      followed: followed.includes(character.id),
    });
  }

  const overlays = bundle.overlays.filter((overlay) => overlayVisible(timeline, overlay, time));
  return { time, episode, current, history: [...spots.values()], characters, overlays };
}

/** The picture to show for an event: its own, else its place's. Without either, a map excerpt is shown instead. */
export function eventPicture(timed: TimedEvent): ImageRef | undefined {
  return timed.event.image ?? timed.place?.image;
}

/** Events a character has taken part in up to (and including) the given moment, latest first. */
export function journeySoFar(timeline: Timeline, characterId: string, time: Time): TimedEvent[] {
  return (timeline.tracks.get(characterId) ?? [])
    .filter((stop) => isAtOrBefore(stop.at.time, time))
    .map((stop) => stop.at)
    .reverse();
}

/** Events that happened at a place before or at the given moment, latest first. */
export function eventsAtPlace(timeline: Timeline, placeId: string, time: Time): TimedEvent[] {
  return timeline.events.filter((timed) => timed.event.placeId === placeId && !isBefore(time, timed.time)).reverse();
}

/* ---------------------------------------------------------------- layout */

export interface LayoutItem {
  id: string;
  kind: 'event' | 'character';
  pos: Point;
}

const CLUSTER_RADIUS = 30;
const EVENT_GAP = 34;
const CHARACTER_GAP = 30;
const PER_ROW = 7;

/**
 * Spreads out markers that would sit on top of each other. Markers closer than a
 * marker's width (at the current zoom) form a cluster: its events are put side by
 * side in a row, its characters in rows beneath. Returns, per marker, how many
 * screen pixels it is shifted away from its true position.
 */
export function declutter(items: LayoutItem[], scale: number): Map<string, [number, number]> {
  interface Cluster {
    x: number;
    y: number;
    items: Array<{ item: LayoutItem; x: number; y: number }>;
  }
  const clusters: Cluster[] = [];
  for (const item of items) {
    const x = item.pos[0] * scale;
    const y = item.pos[1] * scale;
    let home = clusters.find((cluster) => Math.hypot(cluster.x - x, cluster.y - y) < CLUSTER_RADIUS);
    if (!home) clusters.push((home = { x, y, items: [] }));
    home.items.push({ item, x, y });
    // keep the cluster centred on its members
    home.x = home.items.reduce((sum, member) => sum + member.x, 0) / home.items.length;
    home.y = home.items.reduce((sum, member) => sum + member.y, 0) / home.items.length;
  }

  const offsets = new Map<string, [number, number]>();
  for (const cluster of clusters) {
    const events = cluster.items.filter((member) => member.item.kind === 'event');
    const characters = cluster.items.filter((member) => member.item.kind === 'character');
    if (cluster.items.length === 1) {
      offsets.set(cluster.items[0].item.id, [0, 0]);
      continue;
    }
    const place = (members: typeof events, gap: number, top: number) => {
      members.forEach((member, index) => {
        const row = Math.floor(index / PER_ROW);
        const inRow = Math.min(PER_ROW, members.length - row * PER_ROW);
        const column = index - row * PER_ROW;
        const slotX = cluster.x + (column - (inRow - 1) / 2) * gap;
        const slotY = cluster.y + top + row * gap;
        offsets.set(member.item.id, [Math.round(slotX - member.x), Math.round(slotY - member.y)]);
      });
    };
    const eventRows = Math.ceil(events.length / PER_ROW);
    place(events, EVENT_GAP, 0);
    place(characters, CHARACTER_GAP, events.length ? eventRows * EVENT_GAP - 2 : 0);
  }
  return offsets;
}
