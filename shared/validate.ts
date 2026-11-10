/**
 * Cross-reference checks: does every event point at an existing episode,
 * storyline, place and characters? The schema (schema.ts) checks the shape of
 * each entry; this file checks that the entries fit together.
 */
import type { Character, MapDef, Overlay, Place, Point, Saga, SagaBundle, StoryEvent } from './schema.ts';

export interface RefContext {
  map: MapDef;
  episodeIds: Set<string>;
  storylineIds: Set<string>;
  placeIds: Set<string>;
  characterIds: Set<string>;
  eventIds: Set<string>;
}

export function refContext(bundle: Omit<SagaBundle, 'problems'>): RefContext {
  return {
    map: bundle.map,
    episodeIds: new Set(bundle.saga.seasons.flatMap((season) => season.episodes.map((episode) => episode.id))),
    storylineIds: new Set(bundle.saga.storylines.map((storyline) => storyline.id)),
    placeIds: new Set(bundle.places.map((place) => place.id)),
    characterIds: new Set(bundle.characters.map((character) => character.id)),
    eventIds: new Set(bundle.events.map((event) => event.id)),
  };
}

function offMap(point: Point, map: MapDef): boolean {
  return point[0] < 0 || point[1] < 0 || point[0] > map.width || point[1] > map.height;
}

export function sagaProblems(saga: Saga): string[] {
  const problems: string[] = [];
  problems.push(...duplicates('season', saga.seasons.map((season) => season.id)));
  problems.push(...duplicates('episode', saga.seasons.flatMap((season) => season.episodes.map((episode) => episode.id))));
  problems.push(...duplicates('storyline', saga.storylines.map((storyline) => storyline.id)));
  return problems;
}

export function placeProblems(place: Place, ctx: RefContext): string[] {
  return offMap(place.pos, ctx.map) ? [`Place "${place.id}" lies outside the map.`] : [];
}

export function characterProblems(character: Character, ctx: RefContext): string[] {
  const problems: string[] = [];
  const who = `Character "${character.id}"`;
  if (character.storylineId && !ctx.storylineIds.has(character.storylineId)) {
    problems.push(`${who} uses the unknown storyline "${character.storylineId}".`);
  }
  for (const reveal of character.reveals ?? []) {
    if (!ctx.episodeIds.has(reveal.from)) problems.push(`${who} has a reveal in the unknown episode "${reveal.from}".`);
    if (reveal.storylineId && !ctx.storylineIds.has(reveal.storylineId)) {
      problems.push(`${who} has a reveal using the unknown storyline "${reveal.storylineId}".`);
    }
    if (reveal.event && !ctx.eventIds.has(reveal.event)) problems.push(`${who} has a reveal at the unknown event "${reveal.event}".`);
  }
  return problems;
}

export function eventProblems(event: StoryEvent, ctx: RefContext): string[] {
  const problems: string[] = [];
  const what = `Event "${event.id}"`;
  if (!ctx.episodeIds.has(event.episodeId)) problems.push(`${what} belongs to the unknown episode "${event.episodeId}".`);
  if (!ctx.storylineIds.has(event.storylineId)) problems.push(`${what} uses the unknown storyline "${event.storylineId}".`);
  if (event.placeId && !ctx.placeIds.has(event.placeId)) problems.push(`${what} happens at the unknown place "${event.placeId}".`);
  if (event.pos && offMap(event.pos, ctx.map)) problems.push(`${what} lies outside the map.`);
  for (const characterId of event.characters) {
    if (!ctx.characterIds.has(characterId)) problems.push(`${what} lists the unknown character "${characterId}".`);
  }
  for (const characterId of event.exits ?? []) {
    if (!event.characters.includes(characterId)) problems.push(`${what} lets "${characterId}" exit, who does not take part in it.`);
  }
  if (new Set(event.characters).size !== event.characters.length) problems.push(`${what} lists a character twice.`);
  return problems;
}

export function overlayProblems(overlay: Overlay, ctx: RefContext): string[] {
  const problems: string[] = [];
  const what = `Overlay "${overlay.id}"`;
  if (!ctx.episodeIds.has(overlay.from)) problems.push(`${what} starts in the unknown episode "${overlay.from}".`);
  if (overlay.until && !ctx.episodeIds.has(overlay.until)) problems.push(`${what} ends in the unknown episode "${overlay.until}".`);
  if (overlay.fromEvent && !ctx.eventIds.has(overlay.fromEvent)) problems.push(`${what} starts at the unknown event "${overlay.fromEvent}".`);
  if (overlay.untilEvent && !ctx.eventIds.has(overlay.untilEvent)) problems.push(`${what} ends at the unknown event "${overlay.untilEvent}".`);
  if (overlay.points.some((point) => offMap(point, ctx.map))) problems.push(`${what} has a point outside the map.`);
  return problems;
}

function duplicates(kind: string, ids: string[]): string[] {
  const seen = new Set<string>();
  const reported = new Set<string>();
  const problems: string[] = [];
  for (const id of ids) {
    if (seen.has(id) && !reported.has(id)) {
      problems.push(`There is more than one ${kind} with the id "${id}".`);
      reported.add(id);
    }
    seen.add(id);
  }
  return problems;
}

/** All cross-reference problems of a saga. An empty list means the data is consistent. */
export function checkReferences(bundle: Omit<SagaBundle, 'problems'>): string[] {
  const ctx = refContext(bundle);
  const problems: string[] = [];
  if (bundle.saga.mapId !== bundle.map.id) problems.push(`The saga uses map "${bundle.saga.mapId}" but "${bundle.map.id}" was loaded.`);
  problems.push(...sagaProblems(bundle.saga));
  problems.push(...duplicates('place', bundle.places.map((place) => place.id)));
  problems.push(...duplicates('character', bundle.characters.map((character) => character.id)));
  problems.push(...duplicates('event', bundle.events.map((event) => event.id)));
  problems.push(...duplicates('overlay', bundle.overlays.map((overlay) => overlay.id)));
  for (const place of bundle.places) problems.push(...placeProblems(place, ctx));
  for (const character of bundle.characters) problems.push(...characterProblems(character, ctx));
  for (const event of bundle.events) problems.push(...eventProblems(event, ctx));
  for (const overlay of bundle.overlays) problems.push(...overlayProblems(overlay, ctx));
  return problems;
}
