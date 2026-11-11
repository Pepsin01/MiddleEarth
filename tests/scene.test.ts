import { describe, expect, it } from 'vitest';
import { buildTimeline, cursorTime, endOfEpisode } from '../shared/timeline.ts';
import type { SagaBundle } from '../shared/schema.ts';
import { fold, search } from '../src/lib/search.ts';
import { buildScene, buildTrails, declutter, eventsAtPlace, journeySoFar } from '../src/scene.ts';
import { bundle as fixture } from './fixture.ts';

const bundle: SagaBundle = { ...fixture(), problems: [] };
const timeline = buildTimeline(bundle);

describe('scene', () => {
  it('shows the events of the current episode and earlier ones as history', () => {
    const scene = buildScene(bundle, timeline, 's1e2', null, [], [], true)!;
    expect(scene.current.map((timed) => timed.event.id)).toEqual(['e3', 'e4']);
    // e1 (Lindon) and e2 (the mines) happened in the first episode
    expect(scene.history.map((spot) => spot.events.map((timed) => timed.event.id))).toEqual([['e1'], ['e2']]);
    expect(scene.characters.map((entry) => entry.character.id)).toEqual(['galadriel']); // Durin has exited, the Stranger is not here yet
  });

  it('only shows what has happened so far while stepping through an episode', () => {
    const scene = buildScene(bundle, timeline, 's1e2', 'e3', [], [], false)!;
    expect(scene.current.map((timed) => timed.event.id)).toEqual(['e3']);
    expect(scene.history).toEqual([]);
    expect(scene.characters.find((entry) => entry.character.id === 'galadriel')?.pos).toEqual([300, 300]);
    expect(scene.characters.map((entry) => entry.character.id)).toContain('durin');
  });

  it('hides the events and characters of hidden storylines', () => {
    const scene = buildScene(bundle, timeline, 's1e1', null, ['dwarves'], [], true)!;
    expect(scene.current.map((timed) => timed.event.id)).toEqual(['e1']);
    expect(scene.characters.map((entry) => entry.character.id)).toEqual(['galadriel']);
  });

  it('uses the revealed name once the reveal has happened', () => {
    const before = buildScene(bundle, timeline, 's1e2', null, [], [], true)!;
    expect(before.characters.some((entry) => entry.character.id === 'stranger')).toBe(false);
    const after = buildScene(bundle, timeline, 's2e1', null, [], [], true)!;
    expect(after.characters.find((entry) => entry.character.id === 'stranger')?.identity.name).toBe('Gandalf');
  });

  it('lists a journey and the history of a place, latest first', () => {
    expect(journeySoFar(timeline, 'galadriel', endOfEpisode(1)).map((timed) => timed.event.id)).toEqual(['e4', 'e3', 'e1']);
    expect(journeySoFar(timeline, 'galadriel', cursorTime(timeline, 's1e2', 'e3')).map((timed) => timed.event.id)).toEqual(['e3', 'e1']);
    expect(eventsAtPlace(timeline, 'moria', endOfEpisode(0)).map((timed) => timed.event.id)).toEqual(['e2']);
    expect(eventsAtPlace(timeline, 'moria', endOfEpisode(2)).map((timed) => timed.event.id)).toEqual(['e4', 'e2']);
  });
});

describe('trails', () => {
  const route = [
    [100, 100],
    [200, 150],
    [300, 300],
    [500, 400],
  ];

  it("draws this episode's movement of the characters on the map", () => {
    const scene = buildScene(bundle, timeline, 's1e2', null, [], [], true)!;
    expect(buildTrails(bundle, timeline, scene, 'recent', [])).toEqual([{ points: route, color: '#2b6cb0', kind: 'recent' }]);
    expect(buildTrails(bundle, timeline, scene, 'off', [])).toEqual([]);
  });

  it('draws earlier movement as the journey when everything is asked for', () => {
    const scene = buildScene(bundle, timeline, 's2e1', null, [], [], true)!;
    const trails = buildTrails(bundle, timeline, scene, 'all', []);
    expect(trails).toContainEqual({ points: route, color: '#2b6cb0', kind: 'journey' });
  });

  it('always draws the whole journey of followed characters, even with routes switched off', () => {
    const scene = buildScene(bundle, timeline, 's2e1', null, [], ['galadriel'], true)!;
    expect(buildTrails(bundle, timeline, scene, 'off', ['galadriel'])).toEqual([{ points: route, color: '#2b6cb0', kind: 'journey' }]);
  });
});

describe('declutter', () => {
  it('leaves a lone marker where it is', () => {
    expect(declutter([{ id: 'a', kind: 'event', pos: [100, 100] }], 1).get('a')).toEqual([0, 0]);
  });

  it('puts markers at the same spot side by side', () => {
    const offsets = declutter(
      [
        { id: 'a', kind: 'event', pos: [100, 100] },
        { id: 'b', kind: 'event', pos: [100, 100] },
      ],
      1,
    );
    expect(offsets.get('a')).toEqual([-17, 0]);
    expect(offsets.get('b')).toEqual([17, 0]);
  });

  it('puts characters in a row beneath the events of their cluster', () => {
    const offsets = declutter(
      [
        { id: 'event', kind: 'event', pos: [100, 100] },
        { id: 'one', kind: 'character', pos: [100, 100] },
        { id: 'two', kind: 'character', pos: [100, 100] },
      ],
      1,
    );
    expect(offsets.get('event')).toEqual([0, 0]);
    expect(offsets.get('one')).toEqual([-15, 32]);
    expect(offsets.get('two')).toEqual([15, 32]);
  });

  it('only groups markers that are close together at the current zoom', () => {
    const items = [
      { id: 'a', kind: 'event' as const, pos: [100, 100] as [number, number] },
      { id: 'b', kind: 'event' as const, pos: [300, 100] as [number, number] },
    ];
    // zoomed in: 200 map pixels apart is far
    expect([...declutter(items, 1).values()]).toEqual([
      [0, 0],
      [0, 0],
    ]);
    // zoomed far out: the two collapse onto each other and are spread around their middle
    const far = declutter(items, 0.05);
    expect(far.get('a')![0]).toBeLessThan(0);
    expect(far.get('b')![0]).toBeGreaterThan(0);
    // on screen they end up exactly one marker width apart
    const screen = (id: string, x: number) => x * 0.05 + far.get(id)![0];
    expect(screen('b', 300) - screen('a', 100)).toBe(34);
  });
});

describe('search', () => {
  const everything = endOfEpisode(2);

  it('ignores accents and case', () => {
    expect(fold('Khazad-dûm')).toBe('khazad-dum');
    expect(search(bundle, timeline, 'KHAZAD', everything).map((result) => result.id)).toContain('moria');
  });

  it('finds events, characters and places', () => {
    const kinds = search(bundle, timeline, 'lindon', everything).map((result) => `${result.kind}:${result.id}`);
    expect(kinds).toContain('place:lindon');
    expect(kinds).toContain('event:e1');
    expect(search(bundle, timeline, 'galad', everything)[0]).toMatchObject({ kind: 'character', id: 'galadriel' });
  });

  it('needs at least two letters', () => {
    expect(search(bundle, timeline, 'g', everything)).toEqual([]);
  });

  it('never looks past its scope', () => {
    const early = endOfEpisode(1);
    // The Stranger first appears in the last episode and is only then revealed as Gandalf.
    expect(search(bundle, timeline, 'gandalf', early)).toEqual([]);
    expect(search(bundle, timeline, 'stranger', early)).toEqual([]);
    expect(search(bundle, timeline, 'reunion', early)).toEqual([]);
    expect(search(bundle, timeline, 'gandalf', everything)[0]).toMatchObject({ kind: 'character', id: 'stranger', title: 'Gandalf' });
    // the old name still finds him after the reveal
    expect(search(bundle, timeline, 'stranger', everything)[0]).toMatchObject({ id: 'stranger', title: 'Gandalf' });
  });
});
