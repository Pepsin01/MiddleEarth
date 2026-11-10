/**
 * The data model of the app. Everything stored in the `data/` folder is
 * described here, and the server checks every file and every edit against
 * these definitions.
 *
 *   Saga       a series or film set with its own timeline (e.g. The Rings of Power)
 *   Season     a group of episodes
 *   Episode    one step on the time slider
 *   Storyline  a colour-coded thread of the story (the Elves, Númenor, ...)
 *   Place      a named location on the map
 *   Character  a tracked person; their position follows the events they take part in
 *   Event      something that happens: in one episode, at one spot, with some characters
 *   Overlay    a map annotation that appears/disappears over time (labels, regions, ...)
 *   MapDef     a map picture that sagas are drawn on
 */
import { z } from 'zod';

/** Lowercase id used in file names and cross references, e.g. "khazad-dum". */
export const Id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use only lowercase letters, digits and single dashes');

/** A spot on the map: [x, y] in pixels of the full-size map picture, measured from its top-left corner. */
export const Point = z.tuple([z.number().finite(), z.number().finite()]);

export const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #a32a2a');

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export const HttpUrl = z.string().trim().max(2000).refine(isHttpUrl, 'Must be a link starting with http:// or https://');

/** Path of a file inside data/media, e.g. "img/characters/galadriel.jpg". */
export const MediaPath = z
  .string()
  .max(200)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/, 'Not a valid media file path')
  .refine((value) => !value.includes('..'), 'Not a valid media file path');

/**
 * A picture. `file` is the local copy inside data/media (not committed to git);
 * `source` is where it came from, so `npm run media:fetch` can download it again.
 * Pictures you upload by hand only have a `file`.
 */
export const ImageRef = z
  .object({
    file: MediaPath.optional(),
    source: HttpUrl.optional(),
    credit: z.string().trim().max(300).optional(),
    /** Point of interest (0..1 from the left, 0..1 from the top) kept visible in round or cropped views. */
    focus: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
  })
  .refine((value) => Boolean(value.file || value.source), 'A picture needs a file or a source link');

const Text = z.string().trim().max(4000);
const Title = z.string().trim().min(1, 'Required').max(160);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-11');

export const Episode = z.object({
  id: Id,
  title: Title,
  airDate: IsoDate.optional(),
  synopsis: Text.optional(),
  wikiUrl: HttpUrl.optional(),
  image: ImageRef.optional(),
});

export const Season = z.object({
  id: Id,
  title: Title,
  episodes: z.array(Episode),
});

export const Storyline = z.object({
  id: Id,
  title: Title,
  color: Color,
  description: Text.optional(),
});

export const Saga = z.object({
  id: Id,
  title: Title,
  subtitle: z.string().trim().max(200).optional(),
  description: Text.optional(),
  wikiUrl: HttpUrl.optional(),
  /** Which map picture this saga is drawn on (data/maps/<mapId>.json). */
  mapId: Id,
  /** Where the map opens: centre point and zoom level. */
  view: z.object({ center: Point, zoom: z.number() }).optional(),
  seasons: z.array(Season),
  storylines: z.array(Storyline),
});

export const PLACE_KINDS = ['realm', 'region', 'city', 'fortress', 'village', 'mountain', 'forest', 'water', 'ruin', 'other'] as const;

export const Place = z.object({
  id: Id,
  name: Title,
  kind: z.enum(PLACE_KINDS).default('other'),
  pos: Point,
  description: Text.optional(),
  wikiUrl: HttpUrl.optional(),
  image: ImageRef.optional(),
});

/**
 * A change of identity that must not be shown too early, e.g. the Stranger
 * turning out to be Gandalf. From the given episode (or event) onward the
 * fields set here replace the character's normal ones.
 */
export const Reveal = z.object({
  /** Episode from which the new identity is known ... */
  from: Id,
  /** ... or, more precisely, the event that reveals it. */
  event: Id.optional(),
  name: Title.optional(),
  /** New storyline colour for the portrait, e.g. when a friend turns out to be the enemy. */
  storylineId: Id.optional(),
  description: Text.optional(),
  wikiUrl: HttpUrl.optional(),
  image: ImageRef.optional(),
});

export const Character = z.object({
  id: Id,
  name: Title,
  /** Free-form grouping shown in the character list, e.g. "Elves" or "Númenóreans". */
  group: z.string().trim().max(60).optional(),
  /** Storyline whose colour rings the portrait. */
  storylineId: Id.optional(),
  description: Text.optional(),
  wikiUrl: HttpUrl.optional(),
  image: ImageRef.optional(),
  reveals: z.array(Reveal).optional(),
});

export const EVENT_ICONS = [
  'star',
  'battle',
  'council',
  'journey',
  'arrival',
  'death',
  'magic',
  'craft',
  'discovery',
  'omen',
  'disaster',
  'crown',
  'ship',
  'bond',
] as const;

export const IMPORTANCE = ['major', 'minor', 'travel'] as const;

const eventFields = {
  id: Id,
  title: Title,
  storylineId: Id,
  /** major = big marker, minor = small marker, travel = a waypoint that mainly shapes character routes. */
  importance: z.enum(IMPORTANCE).default('major'),
  icon: z.enum(EVENT_ICONS).optional(),
  /** Where it happens: either a named place ... */
  placeId: Id.optional(),
  /** ... or a free spot on the map (wins over placeId when both are given). */
  pos: Point.optional(),
  description: Text.optional(),
  /** Characters taking part. Their portraits move here. */
  characters: z.array(Id).default([]),
  /** Characters who leave the map after this event (death, disappearance) until they show up again. */
  exits: z.array(Id).optional(),
  /** Route the characters took to get here: points passed on the way, in order. */
  via: z.array(Point).optional(),
  /** A scene from the past or a vision: it is shown on the map, but the characters do not travel to it. */
  flashback: z.boolean().optional(),
  image: ImageRef.optional(),
  wikiUrl: HttpUrl.optional(),
};

const needsLocation = (value: { placeId?: string; pos?: [number, number] }) => Boolean(value.placeId || value.pos);
const needsLocationMessage = 'An event needs a place or a position on the map';

/** An event as it is stored in data/sagas/<saga>/events/<episodeId>.json (the file name says which episode). */
export const StoredEvent = z.object(eventFields).refine(needsLocation, needsLocationMessage);

/** An event as the app works with it: the stored fields plus the episode it belongs to. */
export const StoryEvent = z.object({ ...eventFields, episodeId: Id }).refine(needsLocation, needsLocationMessage);

export const OVERLAY_KINDS = ['label', 'region', 'line', 'marker'] as const;

export const Overlay = z
  .object({
    id: Id,
    kind: z.enum(OVERLAY_KINDS),
    title: Title,
    description: Text.optional(),
    wikiUrl: HttpUrl.optional(),
    /** label/marker: one point. line: two or more. region: three or more (the outline). */
    points: z.array(Point).min(1),
    color: Color.optional(),
    dashed: z.boolean().optional(),
    icon: z.enum(EVENT_ICONS).optional(),
    /** Label size relative to normal (1). */
    scale: z.number().min(0.4).max(4).optional(),
    /** Appears at the start of this episode ... */
    from: Id,
    /** ... or, more precisely, once this event has happened. */
    fromEvent: Id.optional(),
    /** Last episode in which it is still shown (leave out for "forever") ... */
    until: Id.optional(),
    /** ... or, more precisely, it disappears once this event has happened. */
    untilEvent: Id.optional(),
  })
  .refine((value) => value.kind !== 'line' || value.points.length >= 2, 'A line needs at least two points')
  .refine((value) => value.kind !== 'region' || value.points.length >= 3, 'A region needs at least three points');

export const MapDef = z.object({
  id: Id,
  title: Title,
  /** Size of the full map picture in pixels. All positions in the data use this scale. */
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** The original picture; `npm run map:tiles` cuts it into zoomable tiles. */
  image: z.object({
    file: MediaPath,
    source: HttpUrl.optional(),
  }),
  tiles: z.object({
    /** Folder inside data/media holding {z}/{x}/{y}.<ext> tiles. */
    path: MediaPath,
    size: z.number().int().positive().default(256),
    maxZoom: z.number().int().min(0),
    ext: z.enum(['jpg', 'webp', 'png']).default('jpg'),
  }),
  /** Shown in the corner of the map. */
  credit: z.string().trim().max(300),
  creditUrl: HttpUrl.optional(),
  /** Colour shown around and behind the map. */
  background: Color.optional(),
  /** Paper colour blended into the map (white becomes this colour). Leave out to show the picture as it is. */
  tint: Color.optional(),
});

export type Id = z.infer<typeof Id>;
export type Point = z.infer<typeof Point>;
export type ImageRef = z.infer<typeof ImageRef>;
export type Episode = z.infer<typeof Episode>;
export type Season = z.infer<typeof Season>;
export type Storyline = z.infer<typeof Storyline>;
export type Saga = z.infer<typeof Saga>;
export type Place = z.infer<typeof Place>;
export type PlaceKind = (typeof PLACE_KINDS)[number];
export type Reveal = z.infer<typeof Reveal>;
export type Character = z.infer<typeof Character>;
export type EventIcon = (typeof EVENT_ICONS)[number];
export type Importance = (typeof IMPORTANCE)[number];
export type StoredEvent = z.infer<typeof StoredEvent>;
export type StoryEvent = z.infer<typeof StoryEvent>;
export type Overlay = z.infer<typeof Overlay>;
export type OverlayKind = (typeof OVERLAY_KINDS)[number];
export type MapDef = z.infer<typeof MapDef>;

/** Everything the app needs to show one saga. */
export interface SagaBundle {
  saga: Saga;
  map: MapDef;
  places: Place[];
  characters: Character[];
  events: StoryEvent[];
  overlays: Overlay[];
  /** Problems found in the data files (bad references, invalid entries that were skipped). */
  problems: string[];
}

export interface SagaSummary {
  id: string;
  title: string;
  subtitle?: string;
  mapId: string;
  episodes: number;
  events: number;
}

/** What the server tells the app about who may edit. */
export interface SessionInfo {
  /** Editing is switched off completely. */
  readOnly: boolean;
  /** A password is configured, so editing needs a login. */
  authRequired: boolean;
  /** This browser is logged in. */
  authenticated: boolean;
  /** Result of the three flags above: may this browser change data right now? */
  canEdit: boolean;
}

export const COLLECTIONS = ['places', 'characters', 'events', 'overlays'] as const;
export type CollectionName = (typeof COLLECTIONS)[number];
