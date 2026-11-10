/** A tiny made-up saga used by the tests, written into a temporary data folder. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Character, MapDef, Overlay, Place, Saga, SagaBundle, StoredEvent } from '../shared/schema.ts';

export const map: MapDef = {
  id: 'test-map',
  title: 'Test map',
  width: 1000,
  height: 800,
  image: { file: 'maps/test-map/source.jpg' },
  tiles: { path: 'maps/test-map/tiles', size: 256, maxZoom: 2, ext: 'jpg' },
  credit: 'Nobody',
};

export const saga: Saga = {
  id: 'test-saga',
  title: 'Test saga',
  mapId: 'test-map',
  seasons: [
    {
      id: 's1',
      title: 'Season 1',
      episodes: [
        { id: 's1e1', title: 'First' },
        { id: 's1e2', title: 'Second' },
      ],
    },
    { id: 's2', title: 'Season 2', episodes: [{ id: 's2e1', title: 'Third' }] },
  ],
  storylines: [
    { id: 'elves', title: 'Elves', color: '#2b6cb0' },
    { id: 'dwarves', title: 'Dwarves', color: '#b3541e' },
  ],
};

export const places: Place[] = [
  { id: 'lindon', name: 'Lindon', kind: 'realm', pos: [100, 100] },
  { id: 'moria', name: 'Khazad-dûm', kind: 'city', pos: [500, 400] },
];

export const characters: Character[] = [
  { id: 'galadriel', name: 'Galadriel', storylineId: 'elves' },
  { id: 'durin', name: 'Durin IV', storylineId: 'dwarves' },
  { id: 'stranger', name: 'The Stranger', reveals: [{ from: 's2e1', name: 'Gandalf' }] },
];

export const events: Record<string, StoredEvent[]> = {
  s1e1: [
    { id: 'e1', title: 'Galadriel in Lindon', storylineId: 'elves', importance: 'major', placeId: 'lindon', characters: ['galadriel'] },
    { id: 'e2', title: 'Durin at home', storylineId: 'dwarves', importance: 'major', placeId: 'moria', characters: ['durin'] },
  ],
  s1e2: [
    { id: 'e3', title: 'On the road', storylineId: 'elves', importance: 'travel', pos: [300, 300], via: [[200, 150]], characters: ['galadriel'] },
    { id: 'e4', title: 'Meeting in the mines', storylineId: 'dwarves', importance: 'major', placeId: 'moria', characters: ['galadriel', 'durin'], exits: ['durin'] },
  ],
  s2e1: [{ id: 'e5', title: 'Reunion', storylineId: 'elves', importance: 'minor', placeId: 'lindon', characters: ['durin', 'stranger'] }],
};

export const overlays: Overlay[] = [
  { id: 'old-name', kind: 'label', title: 'The Southlands', points: [[700, 600]], from: 's1e1', untilEvent: 'e4' },
  { id: 'new-name', kind: 'label', title: 'Mordor', points: [[700, 600]], from: 's1e2', fromEvent: 'e4' },
  { id: 'siege', kind: 'region', title: 'Siege', points: [[10, 10], [50, 10], [30, 40]], from: 's1e2', until: 's1e2' },
];

export function bundle(): Omit<SagaBundle, 'problems'> {
  return {
    saga,
    map,
    places,
    characters,
    overlays,
    events: Object.entries(events).flatMap(([episodeId, list]) => list.map((event) => ({ ...event, episodeId }))),
  };
}

/** Writes the fixture to a fresh temporary folder and returns its path. */
export async function writeFixture(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chronicle-test-'));
  const write = async (file: string, value: unknown) => {
    await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await fs.writeFile(path.join(dir, file), JSON.stringify(value, null, 2));
  };
  await write('maps/test-map.json', map);
  await write('sagas/test-saga/saga.json', saga);
  await write('sagas/test-saga/places.json', places);
  await write('sagas/test-saga/characters.json', characters);
  await write('sagas/test-saga/overlays.json', overlays);
  for (const [episodeId, list] of Object.entries(events)) await write(`sagas/test-saga/events/${episodeId}.json`, list);
  return dir;
}
