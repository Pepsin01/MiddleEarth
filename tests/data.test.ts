/** Guards the story data shipped in data/: every saga must load without problems. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../server/config.ts';
import { Store } from '../server/store.ts';
import { buildTimeline, characterAt, endOfEpisode, firstAppearance } from '../shared/timeline.ts';

const config = loadConfig({});
const store = new Store(config.dataDir);
const sagaIds = fs.readdirSync(path.join(config.dataDir, 'sagas'));

describe.each(sagaIds)('data/sagas/%s', (sagaId) => {
  it('loads without any problems', async () => {
    const bundle = await store.loadBundle(sagaId);
    expect(bundle.problems).toEqual([]);
  });

  it('gives every event a position and every character at least one event', async () => {
    const bundle = await store.loadBundle(sagaId);
    const timeline = buildTimeline(bundle);
    expect(timeline.events.filter((timed) => !timed.pos).map((timed) => timed.event.id)).toEqual([]);
    expect(bundle.characters.filter((character) => !firstAppearance(timeline, character.id)).map((character) => character.id)).toEqual([]);
  });

  it('never shows a character before their first event', async () => {
    const bundle = await store.loadBundle(sagaId);
    const timeline = buildTimeline(bundle);
    for (const character of bundle.characters) {
      const first = firstAppearance(timeline, character.id)!;
      if (first.ep > 0) expect(characterAt(timeline, character.id, endOfEpisode(first.ep - 1))).toBeNull();
    }
  });
});
