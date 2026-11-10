import { describe, expect, it } from 'vitest';
import { slugify, uniqueId } from '../shared/ids.ts';
import {
  buildTimeline,
  characterAt,
  characterPath,
  compareTime,
  cursorTime,
  endOfEpisode,
  firstAppearance,
  identityAt,
  listEpisodes,
  overlayVisible,
  pathLength,
  pointAlong,
  startOfEpisode,
} from '../shared/timeline.ts';
import { checkReferences } from '../shared/validate.ts';
import { bundle, characters, overlays, saga } from './fixture.ts';

const timeline = buildTimeline(bundle());

describe('episodes and time', () => {
  it('numbers episodes across seasons', () => {
    expect(listEpisodes(saga).map((episode) => `${episode.code}:${episode.index}`)).toEqual(['S1E1:0', 'S1E2:1', 'S2E1:2']);
  });

  it('orders moments by episode, then by position inside it', () => {
    expect(compareTime({ ep: 0, ord: 5 }, { ep: 1, ord: 0 })).toBeLessThan(0);
    expect(compareTime(startOfEpisode(1), { ep: 1, ord: 0 })).toBeLessThan(0);
    expect(compareTime(endOfEpisode(1), { ep: 1, ord: 99 })).toBeGreaterThan(0);
    expect(compareTime({ ep: 2, ord: 1 }, { ep: 2, ord: 1 })).toBe(0);
  });

  it('points the cursor at an event, or at the end of the episode', () => {
    expect(cursorTime(timeline, 's1e2', 'e3')).toEqual({ ep: 1, ord: 0 });
    expect(cursorTime(timeline, 's1e2', null)).toEqual(endOfEpisode(1));
    // an event from another episode is ignored
    expect(cursorTime(timeline, 's1e2', 'e1')).toEqual(endOfEpisode(1));
  });
});

describe('character positions', () => {
  it('follows the events a character takes part in', () => {
    expect(characterAt(timeline, 'galadriel', endOfEpisode(0))?.pos).toEqual([100, 100]);
    expect(characterAt(timeline, 'galadriel', cursorTime(timeline, 's1e2', 'e3'))?.pos).toEqual([300, 300]);
    expect(characterAt(timeline, 'galadriel', endOfEpisode(1))?.pos).toEqual([500, 400]);
  });

  it('hides characters before their first event', () => {
    expect(characterAt(timeline, 'stranger', endOfEpisode(1))).toBeNull();
    expect(firstAppearance(timeline, 'stranger')).toEqual({ ep: 2, ord: 0 });
    expect(firstAppearance(timeline, 'nobody')).toBeNull();
  });

  it('removes a character after an exit until they return', () => {
    expect(characterAt(timeline, 'durin', cursorTime(timeline, 's1e2', 'e4'))?.pos).toEqual([500, 400]);
    expect(characterAt(timeline, 'durin', endOfEpisode(1))).toBeNull();
    expect(characterAt(timeline, 'durin', endOfEpisode(2))?.pos).toEqual([100, 100]);
  });

  it('traces the route between two moments, including points passed on the way', () => {
    expect(characterPath(timeline, 'galadriel', endOfEpisode(0), endOfEpisode(1))).toEqual([
      [
        [100, 100],
        [200, 150],
        [300, 300],
        [500, 400],
      ],
    ]);
  });

  it('traces the route backwards when going back in time', () => {
    expect(characterPath(timeline, 'galadriel', endOfEpisode(1), endOfEpisode(0))).toEqual([
      [
        [500, 400],
        [300, 300],
        [200, 150],
        [100, 100],
      ],
    ]);
  });

  it('does not draw a line across an exit', () => {
    // Durin stays in the mines (no movement), exits, then reappears in Lindon: no line connects the two.
    expect(characterPath(timeline, 'durin', endOfEpisode(0), endOfEpisode(2))).toEqual([]);
  });
});

describe('identity reveals', () => {
  const stranger = characters.find((character) => character.id === 'stranger')!;

  it('keeps the secret until the reveal episode', () => {
    expect(identityAt(timeline, stranger, endOfEpisode(1))).toMatchObject({ name: 'The Stranger', revealed: false });
    expect(identityAt(timeline, stranger, startOfEpisode(2))).toMatchObject({ name: 'Gandalf', revealed: true });
  });
});

describe('overlays', () => {
  const [oldName, newName, siege] = overlays;

  it('swaps a label when an event happens', () => {
    const before = cursorTime(timeline, 's1e2', 'e3');
    const at = cursorTime(timeline, 's1e2', 'e4');
    expect(overlayVisible(timeline, oldName, before)).toBe(true);
    expect(overlayVisible(timeline, newName, before)).toBe(false);
    expect(overlayVisible(timeline, oldName, at)).toBe(false);
    expect(overlayVisible(timeline, newName, at)).toBe(true);
  });

  it('shows an overlay through its last episode and not beyond', () => {
    expect(overlayVisible(timeline, siege, endOfEpisode(0))).toBe(false);
    expect(overlayVisible(timeline, siege, endOfEpisode(1))).toBe(true);
    expect(overlayVisible(timeline, siege, endOfEpisode(2))).toBe(false);
  });
});

describe('geometry', () => {
  it('walks along a line of points', () => {
    const line: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    expect(pathLength(line)).toBe(20);
    expect(pointAlong(line, 0)).toEqual([0, 0]);
    expect(pointAlong(line, 0.25)).toEqual([5, 0]);
    expect(pointAlong(line, 0.75)).toEqual([10, 5]);
    expect(pointAlong(line, 1)).toEqual([10, 10]);
  });
});

describe('reference checks', () => {
  it('finds nothing wrong with consistent data', () => {
    expect(checkReferences(bundle())).toEqual([]);
  });

  it('reports dangling references and duplicates', () => {
    const broken = bundle();
    broken.events = [
      ...broken.events,
      { ...broken.events[0], characters: ['galadriel', 'sauron'], placeId: 'mordor', storylineId: 'orcs', exits: ['elrond'] },
    ];
    const problems = checkReferences(broken).join('\n');
    expect(problems).toContain('more than one event with the id "e1"');
    expect(problems).toContain('unknown character "sauron"');
    expect(problems).toContain('unknown place "mordor"');
    expect(problems).toContain('unknown storyline "orcs"');
    expect(problems).toContain('lets "elrond" exit');
  });
});

describe('ids', () => {
  it('makes readable ids from names', () => {
    expect(slugify('Khazad-dûm')).toBe('khazad-dum');
    expect(slugify("  Durin's Bane!  ")).toBe('durins-bane');
    expect(slugify('Númenor · Armenelos')).toBe('numenor-armenelos');
    expect(slugify('???')).toBe('item');
  });

  it('avoids ids that are taken', () => {
    expect(uniqueId('lindon', ['moria'])).toBe('lindon');
    expect(uniqueId('lindon', ['lindon', 'lindon-2'])).toBe('lindon-3');
  });
});
