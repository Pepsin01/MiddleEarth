/**
 * The app's state in one place: the loaded saga, where the time slider is,
 * what is selected, and the viewing options. Components read from it with
 * `useStore(selector)` and change it by calling the actions.
 */
import { create } from 'zustand';
import type { Point, SagaBundle, SagaSummary, SessionInfo } from '../shared/schema.ts';
import { buildTimeline } from '../shared/timeline.ts';
import type { TimedEvent, Timeline } from '../shared/timeline.ts';
import { api, errorText } from './api.ts';
import type { TrailMode } from './scene.ts';

export type SelectionKind = 'event' | 'character' | 'place' | 'overlay';
export type Selection = { kind: SelectionKind; id: string } | null;
export type PlaySpeed = 'slow' | 'normal' | 'fast';

/** Seconds each event stays on screen while playing. */
export const PLAY_SECONDS: Record<PlaySpeed, number> = { slow: 8, normal: 5, fast: 2.5 };

export interface ViewOptions {
  /** Show earlier episodes' events as small faded dots. */
  history: boolean;
  /** Character routes: none, only this episode's movement, or everything so far. */
  trails: TrailMode;
  /** Show pins for all named places. */
  places: boolean;
  /** Show the changing-world annotations. */
  overlays: boolean;
  /** Tint the map like old paper. */
  tint: boolean;
  /** How fast Play moves from event to event. */
  speed: PlaySpeed;
}

export interface CameraRequest {
  point: Point;
  /** Zoom in to at least this level (never zooms out). */
  minZoom?: number;
  nonce: number;
}

const DEFAULT_OPTIONS: ViewOptions = { history: true, trails: 'recent', places: false, overlays: true, tint: true, speed: 'normal' };

interface SavedSagaView {
  episodeId?: string;
  /** Spoiler guard: last watched episode; null = everything may be shown; missing = not asked yet. */
  watched?: string | null;
  hiddenStorylines?: string[];
  followed?: string[];
}

interface Saved {
  sagaId?: string;
  options?: Partial<ViewOptions>;
  sagas?: Record<string, SavedSagaView>;
}

const STORAGE_KEY = 'chronicle:view:v1';

function readSaved(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Saved;
  } catch {
    return {};
  }
}

function writeSaved(change: (saved: Saved) => void): void {
  try {
    const saved = readSaved();
    change(saved);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Private browsing or storage disabled: the app simply forgets its settings.
  }
}

/** The address bar remembers saga, episode and selection: #/rings-of-power/s1e6/event:some-id */
function readHash(): { sagaId?: string; episodeId?: string; selection?: Selection } {
  const [sagaId, episodeId, selected] = window.location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const [kind, id] = (selected ?? '').split(':');
  const valid = ['event', 'character', 'place', 'overlay'].includes(kind) && id;
  return { sagaId: sagaId || undefined, episodeId: episodeId || undefined, selection: valid ? { kind: kind as SelectionKind, id } : undefined };
}

function writeHash(state: Pick<State, 'bundle' | 'episodeId' | 'selection'>): void {
  if (!state.bundle) return;
  const parts = [state.bundle.saga.id, state.episodeId];
  if (state.selection) parts.push(`${state.selection.kind}:${state.selection.id}`);
  const hash = `#/${parts.map(encodeURIComponent).join('/')}`;
  if (hash !== window.location.hash) window.history.replaceState(null, '', hash);
}

export interface State {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  session: SessionInfo;
  sagas: SagaSummary[];
  bundle: SagaBundle | null;
  timeline: Timeline | null;

  /** The episode the time slider is on. */
  episodeId: string;
  /** While stepping or playing: the event the story has reached inside the episode. Otherwise null = end of the episode. */
  stepEventId: string | null;
  /** What the side panel shows. Null = overview of the current episode. */
  selection: Selection;
  hiddenStorylines: string[];
  /** Characters whose whole journey is drawn. */
  followed: string[];
  options: ViewOptions;
  playing: boolean;
  camera: CameraRequest | null;
  /**
   * Spoiler guard: the last episode that has been watched. Nothing later is shown,
   * searched or played. Null = no limit.
   */
  watched: string | null;
  /** False until the viewer has said how far they have watched (asked once per saga). */
  watchedAnswered: boolean;
  /** Edit mode: shows the editing tools. */
  editing: boolean;
  editorTarget: EditorTarget | null;
  /** What the next click on the map is for: the entry's position or another route point. */
  pick: 'pos' | 'via' | null;
  /** The last point picked on the map, for the form to take over. */
  picked: { mode: 'pos' | 'via'; point: Point; nonce: number } | null;
  draftShape: DraftShape | null;
  /** Whether the side panel (details) and the legend (storylines, characters) are open. */
  detailOpen: boolean;
  legendOpen: boolean;
  /** Whether the storyline chart is open. */
  chartOpen: boolean;

  init: () => Promise<void>;
  openSaga: (sagaId: string, initial?: { episodeId?: string; selection?: Selection }) => Promise<void>;
  /** Fetches the data again (after an edit) without disturbing the view. */
  reload: () => Promise<void>;
  setSession: (session: SessionInfo) => void;
  setEpisode: (episodeId: string) => void;
  /** Moves the slider one episode forward (+1) or back (-1). */
  stepEpisode: (delta: 1 | -1) => void;
  select: (selection: Selection) => void;
  setDetailOpen: (open: boolean) => void;
  setLegendOpen: (open: boolean) => void;
  setChartOpen: (open: boolean) => void;
  /** Selects an event, moves the slider to its episode if needed and brings it into view. */
  showEvent: (eventId: string) => void;
  /** Selects an event and brings it into view without moving the time slider. */
  peekEvent: (eventId: string) => void;
  /** Moves the story one event forward (+1) or back (-1). Returns false at either end. */
  step: (delta: 1 | -1) => boolean;
  /** Starts or stops Play. Started at the end of an episode, it begins with that episode's first event. */
  setPlaying: (playing: boolean) => void;
  toggleStoryline: (storylineId: string) => void;
  /** Shows only this storyline; called again on the only visible storyline it shows all of them. */
  soloStoryline: (storylineId: string) => void;
  toggleFollow: (characterId: string) => void;
  setOption: <K extends keyof ViewOptions>(key: K, value: ViewOptions[K]) => void;
  flyTo: (point: Point, minZoom?: number) => void;
  /** Sets the spoiler guard to an episode id, or null to show everything. */
  setWatched: (episodeId: string | null) => void;
  setEditing: (editing: boolean) => void;
  openEditor: (target: EditorTarget | null) => void;
  setPick: (pick: 'pos' | 'via' | null) => void;
  mapPicked: (point: Point) => void;
  setDraftShape: (shape: DraftShape | null) => void;
}

/** What the editor form is working on. `id: null` means a new entry. */
export interface EditorTarget {
  kind: 'event' | 'character' | 'place' | 'saga';
  id: string | null;
}

/** The position and route of the entry being edited, shown on the map while the form is open. */
export interface DraftShape {
  pos?: Point;
  via?: Point[];
  color: string;
}

let cameraNonce = 0;

function selectionExists(timeline: Timeline, bundle: SagaBundle, selection: Selection): boolean {
  if (!selection) return true;
  switch (selection.kind) {
    case 'event':
      return timeline.eventById.has(selection.id);
    case 'character':
      return timeline.characterById.has(selection.id);
    case 'place':
      return timeline.placeById.has(selection.id);
    case 'overlay':
      return bundle.overlays.some((overlay) => overlay.id === selection.id);
  }
}

/** Position on the slider of the last watched episode; Infinity while the spoiler guard is off. */
export function watchedIndex(state: Pick<State, 'timeline' | 'watched'>): number {
  if (!state.watched) return Number.POSITIVE_INFINITY;
  return state.timeline?.episodeById.get(state.watched)?.index ?? Number.POSITIVE_INFINITY;
}

/** Events the stepper walks through: everything watched so far, in story order, except hidden storylines. */
export function steppable(state: Pick<State, 'timeline' | 'hiddenStorylines' | 'watched'>): TimedEvent[] {
  const limit = watchedIndex(state);
  return (state.timeline?.events ?? []).filter((timed) => timed.time.ep <= limit && !state.hiddenStorylines.includes(timed.event.storylineId));
}

export const useStore = create<State>()((set, get) => ({
  status: 'loading',
  error: null,
  session: { readOnly: true, authRequired: false, authenticated: false, canEdit: false },
  sagas: [],
  bundle: null,
  timeline: null,
  episodeId: '',
  stepEventId: null,
  selection: null,
  hiddenStorylines: [],
  followed: [],
  options: { ...DEFAULT_OPTIONS, ...readSaved().options },
  playing: false,
  camera: null,
  chartOpen: false,
  watched: null,
  watchedAnswered: true,
  editing: false,
  editorTarget: null,
  pick: null,
  picked: null,
  draftShape: null,
  // On small screens the panels start closed so the map is visible first.
  detailOpen: window.matchMedia('(min-width: 900px)').matches,
  legendOpen: window.matchMedia('(min-width: 1200px)').matches,

  init: async () => {
    try {
      const [session, sagas] = await Promise.all([api.session(), api.sagas()]);
      set({ session, sagas });
      const hash = readHash();
      const wanted = hash.sagaId ?? readSaved().sagaId;
      const sagaId = sagas.find((saga) => saga.id === wanted)?.id ?? sagas[0]?.id;
      if (!sagaId) {
        set({ status: 'ready' });
        return;
      }
      await get().openSaga(sagaId, hash.sagaId === sagaId ? hash : undefined);
    } catch (error) {
      set({ status: 'error', error: errorText(error) });
    }
  },

  openSaga: async (sagaId, initial) => {
    set({ status: 'loading', error: null, playing: false });
    try {
      const bundle = await api.bundle(sagaId);
      const timeline = buildTimeline(bundle);
      const saved = readSaved().sagas?.[sagaId] ?? {};
      const watched = saved.watched && timeline.episodeById.has(saved.watched) ? saved.watched : null;
      // Until the viewer has said how far they have watched, only the first episode is shown behind the question.
      const limit = watched ? timeline.episodeById.get(watched)!.index : saved.watched === undefined ? 0 : Number.POSITIVE_INFINITY;
      const allowed = (id: string | undefined) => Boolean(id && (timeline.episodeById.get(id)?.index ?? Number.POSITIVE_INFINITY) <= limit);
      const episodeId = [initial?.episodeId, saved.episodeId].find(allowed) ?? timeline.episodes[0]?.id ?? '';
      let selection = initial?.selection && selectionExists(timeline, bundle, initial.selection) ? initial.selection : null;
      if (selection?.kind === 'event' && (timeline.eventById.get(selection.id)?.time.ep ?? 0) > limit) selection = null;
      const storylineIds = new Set(bundle.saga.storylines.map((storyline) => storyline.id));
      set({
        status: 'ready',
        bundle,
        timeline,
        episodeId,
        stepEventId: null,
        selection,
        hiddenStorylines: (saved.hiddenStorylines ?? []).filter((id) => storylineIds.has(id)),
        followed: (saved.followed ?? []).filter((id) => timeline.characterById.has(id)),
        camera: null,
        watched,
        watchedAnswered: saved.watched !== undefined,
      });
      writeSaved((all) => {
        all.sagaId = sagaId;
      });
    } catch (error) {
      set({ status: 'error', error: errorText(error) });
    }
  },

  reload: async () => {
    const current = get().bundle;
    if (!current) return;
    const bundle = await api.bundle(current.saga.id);
    const timeline = buildTimeline(bundle);
    const state = get();
    set({
      bundle,
      timeline,
      episodeId: timeline.episodeById.has(state.episodeId) ? state.episodeId : (timeline.episodes[0]?.id ?? ''),
      stepEventId: state.stepEventId && timeline.eventById.has(state.stepEventId) ? state.stepEventId : null,
      selection: selectionExists(timeline, bundle, state.selection) ? state.selection : null,
      followed: state.followed.filter((id) => timeline.characterById.has(id)),
    });
    set({ sagas: await api.sagas() });
  },

  setSession: (session) => set({ session }),

  setEpisode: (episodeId) => {
    const target = get().timeline?.episodeById.get(episodeId);
    if (!target || target.index > watchedIndex(get())) return;
    const change: Partial<State> = { episodeId, stepEventId: null };
    // An event of another episode stays selected only while that is deliberate; moving the slider returns to the overview.
    const { selection, timeline } = get();
    if (selection?.kind === 'event' && timeline?.eventById.get(selection.id)?.event.episodeId !== episodeId) change.selection = null;
    set(change);
  },

  stepEpisode: (delta) => {
    const { timeline, episodeId } = get();
    if (!timeline) return;
    const index = timeline.episodeById.get(episodeId)?.index ?? 0;
    const next = timeline.episodes[index + delta];
    if (next) get().setEpisode(next.id);
  },

  select: (selection) => set(selection ? { selection, detailOpen: true } : { selection }),
  setDetailOpen: (detailOpen) => set({ detailOpen }),
  setLegendOpen: (legendOpen) => set({ legendOpen }),
  setChartOpen: (chartOpen) => set({ chartOpen }),

  showEvent: (eventId) => {
    const timed = get().timeline?.eventById.get(eventId);
    if (!timed || timed.time.ep > watchedIndex(get())) return;
    const change: Partial<State> = { selection: { kind: 'event', id: eventId }, detailOpen: true };
    if (timed.event.episodeId !== get().episodeId) {
      change.episodeId = timed.event.episodeId;
      change.stepEventId = null;
    }
    set(change);
    if (timed.pos) get().flyTo(timed.pos);
  },

  peekEvent: (eventId) => {
    const timed = get().timeline?.eventById.get(eventId);
    if (!timed || timed.time.ep > watchedIndex(get())) return;
    set({ selection: { kind: 'event', id: eventId }, detailOpen: true });
    if (timed.pos) get().flyTo(timed.pos);
  },

  step: (delta) => {
    const state = get();
    const { timeline } = state;
    if (!timeline) return false;
    const events = steppable(state);
    const episodeIndex = timeline.episodeById.get(state.episodeId)?.index ?? 0;

    let next: TimedEvent | undefined;
    const at = state.stepEventId ? events.findIndex((timed) => timed.event.id === state.stepEventId) : -1;
    if (at >= 0) {
      next = events[at + delta];
    } else if (delta > 0) {
      // At the end of an episode: continue with the first event of a later episode.
      next = events.find((timed) => timed.time.ep > episodeIndex);
    } else {
      // At the end of an episode: step back onto its last event (or the last one before it).
      next = events.findLast((timed) => timed.time.ep <= episodeIndex);
      // ...but if that is where "end of episode" already is, go one further back.
      const last = timeline.eventsByEpisode.get(state.episodeId)?.at(-1);
      if (next && last && next.event.id === last.event.id) next = events[events.indexOf(next) - 1];
    }
    if (!next) return false;

    set({ episodeId: next.event.episodeId, stepEventId: next.event.id, selection: { kind: 'event', id: next.event.id } });
    if (next.pos) get().flyTo(next.pos);
    return true;
  },

  setPlaying: (playing) => {
    if (!playing) {
      set({ playing: false });
      return;
    }
    const state = get();
    const { timeline } = state;
    if (!timeline) return;
    if (!state.stepEventId) {
      // Not in the middle of an episode: start with the first event of the current one (or of the next one that has any).
      const index = timeline.episodeById.get(state.episodeId)?.index ?? 0;
      const first = steppable(state).find((timed) => timed.time.ep >= index);
      if (!first) return;
      set({ episodeId: first.event.episodeId, stepEventId: first.event.id, selection: { kind: 'event', id: first.event.id }, detailOpen: true });
      if (first.pos) state.flyTo(first.pos);
    }
    set({ playing: true });
  },

  toggleStoryline: (storylineId) => {
    const hidden = get().hiddenStorylines;
    set({ hiddenStorylines: hidden.includes(storylineId) ? hidden.filter((id) => id !== storylineId) : [...hidden, storylineId] });
  },

  soloStoryline: (storylineId) => {
    const all = get().bundle?.saga.storylines.map((storyline) => storyline.id) ?? [];
    const others = all.filter((id) => id !== storylineId);
    const hidden = get().hiddenStorylines;
    const alreadySolo = others.every((id) => hidden.includes(id)) && !hidden.includes(storylineId);
    set({ hiddenStorylines: alreadySolo ? [] : others });
  },

  toggleFollow: (characterId) => {
    const followed = get().followed;
    set({ followed: followed.includes(characterId) ? followed.filter((id) => id !== characterId) : [...followed, characterId] });
  },

  setOption: (key, value) => {
    const options = { ...get().options, [key]: value };
    set({ options });
    writeSaved((all) => {
      all.options = options;
    });
  },

  flyTo: (point, minZoom) => set({ camera: { point, minZoom, nonce: ++cameraNonce } }),

  setWatched: (watched) => {
    const state = get();
    const { timeline, bundle } = state;
    if (!timeline || !bundle) return;
    const change: Partial<State> = { watched, watchedAnswered: true };
    const limit = watched ? (timeline.episodeById.get(watched)?.index ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
    // Step back if the slider is now beyond what may be shown.
    if ((timeline.episodeById.get(state.episodeId)?.index ?? 0) > limit) {
      Object.assign(change, { episodeId: watched!, stepEventId: null, selection: null, playing: false });
    }
    set(change);
    const sagaId = bundle.saga.id;
    writeSaved((all) => {
      all.sagas = { ...all.sagas, [sagaId]: { ...all.sagas?.[sagaId], watched } };
    });
  },

  setEditing: (editing) => set(editing ? { editing, playing: false } : { editing, editorTarget: null, pick: null, draftShape: null }),
  openEditor: (editorTarget) => set({ editorTarget, pick: null, picked: null, draftShape: null, detailOpen: true, playing: false }),
  setPick: (pick) => set({ pick }),
  mapPicked: (point) => {
    const mode = get().pick;
    if (!mode) return;
    // A position is picked once; route points keep coming until the mode is switched off.
    set({ picked: { mode, point, nonce: ++cameraNonce }, pick: mode === 'via' ? 'via' : null });
  },
  setDraftShape: (draftShape) => set({ draftShape }),
}));

// Remember the view between visits and keep the address bar in sync.
useStore.subscribe((state, previous) => {
  if (!state.bundle) return;
  if (state.episodeId !== previous.episodeId || state.selection !== previous.selection || state.bundle !== previous.bundle) {
    writeHash(state);
  }
  if (
    state.episodeId !== previous.episodeId ||
    state.hiddenStorylines !== previous.hiddenStorylines ||
    state.followed !== previous.followed ||
    state.bundle !== previous.bundle
  ) {
    const sagaId = state.bundle.saga.id;
    writeSaved((all) => {
      all.sagas = { ...all.sagas, [sagaId]: { ...all.sagas?.[sagaId], episodeId: state.episodeId, hiddenStorylines: state.hiddenStorylines, followed: state.followed } };
    });
  }
});
