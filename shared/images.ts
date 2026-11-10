import type { ImageRef, SagaBundle } from './schema.ts';

/** Every picture referenced by a saga (episodes, places, characters incl. reveals, events). */
export function collectImages(bundle: Pick<SagaBundle, 'saga' | 'places' | 'characters' | 'events'>): ImageRef[] {
  const images: Array<ImageRef | undefined> = [
    ...bundle.saga.seasons.flatMap((season) => season.episodes.map((episode) => episode.image)),
    ...bundle.places.map((place) => place.image),
    ...bundle.characters.flatMap((character) => [character.image, ...(character.reveals ?? []).map((reveal) => reveal.image)]),
    ...bundle.events.map((event) => event.image),
  ];
  return images.filter((image): image is ImageRef => image !== undefined);
}
