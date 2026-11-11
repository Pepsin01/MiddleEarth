/** Guards the story data shipped in data/: every saga must load without problems. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../server/config.ts';
import { Store } from '../server/store.ts';
import { buildTimeline, characterAt, cursorTime, endOfEpisode, firstAppearance, overlayVisible } from '../shared/timeline.ts';

const config = loadConfig({});
const store = new Store(config.dataDir);
const sagaIds = fs.readdirSync(path.join(config.dataDir, 'sagas'));

describe('the changing world of The Rings of Power', () => {
  it('turns the Southlands into Mordor at the right moments', async () => {
    const bundle = await store.loadBundle('rings-of-power');
    const timeline = buildTimeline(bundle);
    const shown = (episodeId: string, eventId?: string) =>
      bundle.overlays.filter((overlay) => overlayVisible(timeline, overlay, cursorTime(timeline, episodeId, eventId))).map((overlay) => overlay.id);

    expect(shown('s1e1')).toContain('the-southlands');
    expect(shown('s1e6', 's1e6-the-key-turns')).toContain('the-southlands');
    expect(shown('s1e6')).toContain('the-ash-cloud');
    expect(shown('s1e6')).not.toContain('the-southlands');
    expect(shown('s1e7')).toContain('mordor');
    expect(shown('s1e7')).not.toContain('the-ash-cloud');
    expect(shown('s2e4')).toContain('march-on-eregion');
    expect(shown('s2e6')).not.toContain('march-on-eregion');
    expect(shown('s2e7')).toContain('siege-of-eregion');
    expect(shown('s2e8')).toEqual(expect.arrayContaining(['eregion-fallen', 'imladris-founded', 'durins-bane-awake']));
    expect(shown('s2e8')).not.toContain('siege-of-eregion');
  });
});

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
