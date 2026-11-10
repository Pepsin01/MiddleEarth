/**
 * Pure story logic shared by the server and the web app: the order of
 * episodes and events, where every character is at a given moment, which
 * identity reveals have happened, and which map overlays are showing.
 */
import type { Character, Episode, ImageRef, Overlay, Place, Point, Saga, SagaBundle, Season, StoryEvent } from './schema.ts';

/** A moment in the story: episode number (0-based, across all seasons) and position inside that episode. */
export interface Time {
  ep: number;
  /** Index of the event inside its episode; START = before anything happened, END = after everything. */
  ord: number;
}

export const START = -1;
export const END = Number.POSITIVE_INFINITY;

export function compareTime(a: Time, b: Time): number {
  return a.ep !== b.ep ? a.ep - b.ep : a.ord === b.ord ? 0 : a.ord < b.ord ? -1 : 1;
}

export const isBefore = (a: Time, b: Time) => compareTime(a, b) < 0;
export const isAtOrBefore = (a: Time, b: Time) => compareTime(a, b) <= 0;

export interface EpisodeRef {
  id: string;
  /** Position on the time slider, 0-based across all seasons. */
  index: number;
  episode: Episode;
  season: Season;
  seasonIndex: number;
  /** 1-based number inside its season. */
  number: number;
  /** Short label such as "S2E5". */
  code: string;
}

export interface TimedEvent {
  event: StoryEvent;
  time: Time;
  episode: EpisodeRef;
  /** Resolved map position (own position, or that of its place). Undefined if the place is missing. */
  pos?: Point;
  place?: Place;
}

/** One stop of a character's journey. */
export interface Stop {
  at: TimedEvent;
  pos: Point;
  /** Points passed on the way to this stop. */
  via: Point[];
  /** The character leaves the map after this stop. */
  exit: boolean;
}

export interface Timeline {
  episodes: EpisodeRef[];
  episodeById: Map<string, EpisodeRef>;
  /** All events in story order. Events of unknown episodes are left out. */
  events: TimedEvent[];
  eventById: Map<string, TimedEvent>;
  eventsByEpisode: Map<string, TimedEvent[]>;
  placeById: Map<string, Place>;
  characterById: Map<string, Character>;
  /** Journey of each character: their stops in story order. */
  tracks: Map<string, Stop[]>;
}

export function listEpisodes(saga: Saga): EpisodeRef[] {
  const out: EpisodeRef[] = [];
  saga.seasons.forEach((season, seasonIndex) => {
    season.episodes.forEach((episode, i) => {
      out.push({
        id: episode.id,
        index: out.length,
        episode,
        season,
        seasonIndex,
        number: i + 1,
        code: `S${seasonIndex + 1}E${i + 1}`,
      });
    });
  });
  return out;
}

export function buildTimeline(bundle: Pick<SagaBundle, 'saga' | 'places' | 'characters' | 'events'>): Timeline {
  const episodes = listEpisodes(bundle.saga);
  const episodeById = new Map(episodes.map((ref) => [ref.id, ref]));
  const placeById = new Map(bundle.places.map((place) => [place.id, place]));
  const characterById = new Map(bundle.characters.map((character) => [character.id, character]));

  // Events keep the order they have in the data; within one episode that is story order.
  const eventsByEpisode = new Map<string, TimedEvent[]>(episodes.map((ref) => [ref.id, []]));
  for (const event of bundle.events) {
    const episode = episodeById.get(event.episodeId);
    const list = eventsByEpisode.get(event.episodeId);
    if (!episode || !list) continue;
    const place = event.placeId ? placeById.get(event.placeId) : undefined;
    list.push({ event, episode, place, pos: event.pos ?? place?.pos, time: { ep: episode.index, ord: list.length } });
  }
  const events = episodes.flatMap((ref) => eventsByEpisode.get(ref.id) ?? []);
  const eventById = new Map(events.map((timed) => [timed.event.id, timed]));

  const tracks = new Map<string, Stop[]>();
  for (const timed of events) {
    if (!timed.pos) continue;
    for (const characterId of timed.event.characters) {
      let track = tracks.get(characterId);
      if (!track) tracks.set(characterId, (track = []));
      track.push({
        at: timed,
        pos: timed.pos,
        via: timed.event.via ?? [],
        exit: timed.event.exits?.includes(characterId) ?? false,
      });
    }
  }

  return { episodes, episodeById, events, eventById, eventsByEpisode, placeById, characterById, tracks };
}

/** The moment the time slider points at: a specific event, or the end of an episode. */
export function cursorTime(timeline: Timeline, episodeId: string, eventId?: string | null): Time {
  const focused = eventId ? timeline.eventById.get(eventId) : undefined;
  if (focused && focused.event.episodeId === episodeId) return focused.time;
  return { ep: timeline.episodeById.get(episodeId)?.index ?? 0, ord: END };
}

export const endOfEpisode = (index: number): Time => ({ ep: index, ord: END });
export const startOfEpisode = (index: number): Time => ({ ep: index, ord: START });

function lastStopAt(track: Stop[] | undefined, time: Time): number {
  if (!track) return -1;
  let found = -1;
  for (let i = 0; i < track.length; i++) {
    if (isAtOrBefore(track[i].at.time, time)) found = i;
    else break;
  }
  return found;
}

export interface CharacterState {
  /** The stop the character is at (their most recent event). */
  stop: Stop;
  pos: Point;
}

/** Where a character is at the given moment, or null while they are not on the map. */
export function characterAt(timeline: Timeline, characterId: string, time: Time): CharacterState | null {
  const track = timeline.tracks.get(characterId);
  const index = lastStopAt(track, time);
  if (!track || index < 0) return null;
  const stop = track[index];
  // Someone who exits is still shown during the exit event itself, but gone afterwards.
  if (stop.exit && isBefore(stop.at.time, time)) return null;
  return { stop, pos: stop.pos };
}

export function firstAppearance(timeline: Timeline, characterId: string): Time | null {
  return timeline.tracks.get(characterId)?.[0]?.at.time ?? null;
}

/**
 * The route a character travelled between two moments, as one or more lines.
 * A line is broken wherever the character left the map and came back.
 * Works in both directions; the points always run from `from` to `to`.
 */
export function characterPath(timeline: Timeline, characterId: string, from: Time, to: Time): Point[][] {
  if (compareTime(from, to) > 0) {
    return characterPath(timeline, characterId, to, from)
      .map((line) => [...line].reverse())
      .reverse();
  }
  const track = timeline.tracks.get(characterId);
  if (!track) return [];

  const lines: Point[][] = [];
  const startIndex = lastStopAt(track, from);
  let line: Point[] = [];
  if (startIndex >= 0 && !track[startIndex].exit) line.push(track[startIndex].pos);

  for (let i = startIndex + 1; i < track.length; i++) {
    const stop = track[i];
    if (!isAtOrBefore(stop.at.time, to)) break;
    line.push(...stop.via, stop.pos);
    if (stop.exit) {
      if (line.length > 1) lines.push(line);
      line = [];
    }
  }
  if (line.length > 1) lines.push(line);
  return lines.map(dropRepeats).filter((points) => points.length > 1);
}

function dropRepeats(points: Point[]): Point[] {
  return points.filter((point, i) => i === 0 || point[0] !== points[i - 1][0] || point[1] !== points[i - 1][1]);
}

export interface Identity {
  name: string;
  description?: string;
  wikiUrl?: string;
  image?: ImageRef;
  /** True once at least one reveal has been applied. */
  revealed: boolean;
}

/** Name, picture and links of a character as known at the given moment (identity reveals applied). */
export function identityAt(timeline: Timeline, character: Character, time: Time): Identity {
  const identity: Identity = {
    name: character.name,
    description: character.description,
    wikiUrl: character.wikiUrl,
    image: character.image,
    revealed: false,
  };
  for (const reveal of character.reveals ?? []) {
    const moment = revealTime(timeline, reveal.from, reveal.event);
    if (!moment || !isAtOrBefore(moment, time)) continue;
    identity.revealed = true;
    if (reveal.name) identity.name = reveal.name;
    if (reveal.description) identity.description = reveal.description;
    if (reveal.wikiUrl) identity.wikiUrl = reveal.wikiUrl;
    if (reveal.image) identity.image = reveal.image;
  }
  return identity;
}

function revealTime(timeline: Timeline, episodeId: string, eventId?: string): Time | null {
  const event = eventId ? timeline.eventById.get(eventId) : undefined;
  if (event) return event.time;
  const episode = timeline.episodeById.get(episodeId);
  return episode ? startOfEpisode(episode.index) : null;
}

export function overlayVisible(timeline: Timeline, overlay: Overlay, time: Time): boolean {
  const from = revealTime(timeline, overlay.from, overlay.fromEvent);
  if (!from || isBefore(time, from)) return false;

  const untilEvent = overlay.untilEvent ? timeline.eventById.get(overlay.untilEvent) : undefined;
  if (untilEvent) return isBefore(time, untilEvent.time);
  const untilEpisode = overlay.until ? timeline.episodeById.get(overlay.until) : undefined;
  if (untilEpisode) return time.ep <= untilEpisode.index;
  return true;
}

/* ---------- geometry helpers used for moving portraits along a route ---------- */

export function distance(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}

/** The point a fraction `t` (0..1) of the way along a line of points. */
export function pointAlong(points: Point[], t: number): Point {
  if (points.length === 0) return [0, 0];
  if (points.length === 1 || t <= 0) return points[0];
  if (t >= 1) return points[points.length - 1];
  let remaining = pathLength(points) * t;
  for (let i = 1; i < points.length; i++) {
    const segment = distance(points[i - 1], points[i]);
    if (remaining <= segment) {
      const f = segment === 0 ? 0 : remaining / segment;
      return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f];
    }
    remaining -= segment;
  }
  return points[points.length - 1];
}
