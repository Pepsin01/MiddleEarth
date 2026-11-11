import type { ImageRef, SagaBundle } from '../../shared/schema.ts';
import { firstAppearance, identityAt, isAtOrBefore } from '../../shared/timeline.ts';
import type { Time, Timeline } from '../../shared/timeline.ts';
import { eventPicture, storylineColor } from '../scene.ts';

export interface SearchResult {
  kind: 'event' | 'character' | 'place';
  id: string;
  title: string;
  subtitle: string;
  color: string;
  image?: ImageRef;
}

/** Lowercase without accents, so "numenor" finds "Númenor". */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function score(haystack: string, needle: string): number {
  const text = fold(haystack);
  if (text.startsWith(needle)) return 3;
  if (text.includes(` ${needle}`)) return 2;
  return text.includes(needle) ? 1 : 0;
}

/**
 * Finds events, characters and places matching the query.
 * Nothing later than `scope` is searched or shown, so the search cannot give away
 * what has not been watched yet (hidden names included).
 */
export function search(bundle: SagaBundle, timeline: Timeline, query: string, scope: Time): SearchResult[] {
  const needle = fold(query.trim());
  if (needle.length < 2) return [];
  const found: Array<SearchResult & { rank: number }> = [];

  for (const character of bundle.characters) {
    const first = firstAppearance(timeline, character.id);
    if (!first || !isAtOrBefore(first, scope)) continue;
    const identity = identityAt(timeline, character, scope);
    // Names the character has gone by so far are all searchable ("Halbrand" still finds him after the reveal).
    const known = [character.name, identity.name];
    const rank = Math.max(...known.map((name) => score(name, needle)));
    if (rank > 0) {
      found.push({
        kind: 'character',
        id: character.id,
        title: identity.name,
        subtitle: character.group ?? 'Character',
        color: storylineColor(bundle, identity.storylineId),
        image: identity.image,
        rank: rank + 0.5,
      });
    }
  }

  const usedPlaces = new Set<string>();
  const laterPlaces = new Set<string>();
  for (const timed of timeline.events) {
    if (!timed.event.placeId) continue;
    (isAtOrBefore(timed.time, scope) ? usedPlaces : laterPlaces).add(timed.event.placeId);
  }
  for (const place of bundle.places) {
    if (!usedPlaces.has(place.id) && laterPlaces.has(place.id)) continue; // only shows up later in the story
    const rank = score(place.name, needle);
    if (rank > 0) found.push({ kind: 'place', id: place.id, title: place.name, subtitle: 'Place', color: '#6b5b45', image: place.image, rank: rank + 0.25 });
  }

  for (const timed of timeline.events) {
    if (!isAtOrBefore(timed.time, scope)) continue;
    const rank = Math.max(score(timed.event.title, needle), timed.event.description && fold(timed.event.description).includes(needle) ? 0.6 : 0);
    if (rank > 0) {
      found.push({
        kind: 'event',
        id: timed.event.id,
        title: timed.event.title,
        subtitle: [timed.episode.code, timed.place?.name].filter(Boolean).join(' · '),
        color: storylineColor(bundle, timed.event.storylineId),
        image: eventPicture(timeline, timed),
        rank,
      });
    }
  }

  return found.sort((a, b) => b.rank - a.rank).slice(0, 14);
}
