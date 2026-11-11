/** The editing forms for events, characters, places and the saga's episodes and storylines. */
import { Crosshair, Plus, Route, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { EVENT_ICONS as ICON_NAMES, IMPORTANCE, PLACE_KINDS } from '../../shared/schema.ts';
import type { Character, CollectionName, Episode, ImageRef, Place, Point, Reveal, Saga, StoryEvent } from '../../shared/schema.ts';
import { ApiError, api, errorText } from '../api.ts';
import { EVENT_ICONS } from '../components/icons.tsx';
import { storylineColor } from '../scene.ts';
import { useStore } from '../store.ts';
import type { SelectionKind } from '../store.ts';
import { Field, ImageField, SelectField, TextArea, TextField, blank } from './fields.tsx';

const IMPORTANCE_LABEL = { major: 'Major event (large marker)', minor: 'Minor event (small marker)', travel: 'Waypoint (mainly shapes the route)' } as const;

/** Runs a save or delete, showing "working" and any error the server reports. */
function useTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/** After a successful save: load the fresh data, close the form and show the saved entry. */
async function finish(kind: SelectionKind | null, id: string | null) {
  const { reload, openEditor, select } = useStore.getState();
  await reload();
  openEditor(null);
  select(kind && id ? { kind, id } : null);
}

/** Deletes an entry after asking; if it is still in use, explains and asks again. */
async function removeEntry(sagaId: string, collection: CollectionName, id: string, label: string): Promise<boolean> {
  if (!window.confirm(`Delete "${label}"? An automatic backup is made first.`)) return false;
  try {
    await api.remove(sagaId, collection, id);
  } catch (failure) {
    if (!(failure instanceof ApiError) || failure.status !== 409) throw failure;
    const consequence = collection === 'places' ? 'The events keep their spot on the map.' : 'It will be taken out of those events.';
    if (!window.confirm(`${failure.message} ${consequence}\n\nDelete anyway?`)) return false;
    await api.remove(sagaId, collection, id, true);
  }
  return true;
}

function FormShell({ onSubmit, busy, error, onDelete, children }: { onSubmit: () => void; busy: boolean; error: string | null; onDelete?: () => void; children: ReactNode }) {
  const openEditor = useStore((state) => state.openEditor);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form className="form" onSubmit={submit}>
      <div className="form__fields">{children}</div>
      {error && <p className="form-error">{error}</p>}
      <div className="form__buttons">
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="button" onClick={() => openEditor(null)}>
          Cancel
        </button>
        {onDelete && (
          <button type="button" className="button button--danger" disabled={busy} onClick={onDelete}>
            <Trash2 aria-hidden="true" /> Delete
          </button>
        )}
      </div>
    </form>
  );
}

/** Button that makes the next click on the map set this entry's position. */
function PositionPicker({ pos, label = 'Position on the map' }: { pos: Point | undefined; label?: string }) {
  const pick = useStore((state) => state.pick);
  const setPick = useStore((state) => state.setPick);
  const flyTo = useStore((state) => state.flyTo);
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="form__row">
        <button type="button" className={`button${pick === 'pos' ? ' is-on' : ''}`} onClick={() => setPick(pick === 'pos' ? null : 'pos')}>
          <Crosshair aria-hidden="true" /> {pick === 'pos' ? 'Now click the map…' : pos ? 'Move it' : 'Pick on the map'}
        </button>
        {pos && (
          <button type="button" className="text-button" onClick={() => flyTo(pos)}>
            {pos[0]}, {pos[1]}
          </button>
        )}
      </div>
    </div>
  );
}

/** Takes over points picked on the map while the form is open. */
function usePicked(onPos: (point: Point) => void, onVia?: (point: Point) => void) {
  const picked = useStore((state) => state.picked);
  useEffect(() => {
    if (!picked) return;
    if (picked.mode === 'pos') onPos(picked.point);
    else onVia?.(picked.point);
    // only react to a new pick, not to re-created callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);
}

/* ------------------------------------------------------------------- event */

export function EventForm({ id }: { id: string | null }) {
  const bundle = useStore((state) => state.bundle)!;
  const timeline = useStore((state) => state.timeline)!;
  const currentEpisode = useStore((state) => state.episodeId);
  const pick = useStore((state) => state.pick);
  const setPick = useStore((state) => state.setPick);
  const setDraftShape = useStore((state) => state.setDraftShape);
  const original = id ? timeline.eventById.get(id) : undefined;
  const task = useTask();

  const [form, setForm] = useState(() => {
    const event = original?.event;
    const siblings = event ? (timeline.eventsByEpisode.get(event.episodeId) ?? []) : [];
    const next = event ? siblings[siblings.findIndex((timed) => timed.event.id === event.id) + 1] : undefined;
    return {
      title: event?.title ?? '',
      episodeId: event?.episodeId ?? currentEpisode,
      before: next?.event.id ?? '',
      storylineId: event?.storylineId ?? bundle.saga.storylines[0]?.id ?? '',
      importance: event?.importance ?? ('major' as StoryEvent['importance']),
      icon: (event?.icon ?? '') as string,
      placeId: event?.pos ? '' : (event?.placeId ?? ''),
      pos: event?.pos,
      description: event?.description ?? '',
      characters: event?.characters ?? [],
      exits: event?.exits ?? [],
      via: event?.via ?? [],
      flashback: event?.flashback ?? false,
      image: event?.image as ImageRef | undefined,
      suggestedPicture: event?.suggestedPicture ?? '',
      wikiUrl: event?.wikiUrl ?? '',
    };
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  usePicked(
    (point) => setForm((current) => ({ ...current, pos: point, placeId: '' })),
    (point) => setForm((current) => ({ ...current, via: [...current.via, point] })),
  );

  const place = form.placeId ? timeline.placeById.get(form.placeId) : undefined;
  const shownPos = place?.pos ?? form.pos;
  const color = storylineColor(bundle, form.storylineId);
  useEffect(() => {
    setDraftShape({ pos: shownPos, via: form.via, color });
    return () => setDraftShape(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownPos?.[0], shownPos?.[1], form.via, color]);

  const siblings = (timeline.eventsByEpisode.get(form.episodeId) ?? []).filter((timed) => timed.event.id !== id);
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);

  const save = () =>
    task.run(async () => {
      const value: Partial<StoryEvent> = {
        title: form.title,
        episodeId: form.episodeId,
        storylineId: form.storylineId,
        importance: form.importance,
        icon: (form.icon || undefined) as StoryEvent['icon'],
        placeId: form.placeId || undefined,
        pos: form.placeId ? undefined : form.pos,
        description: blank(form.description),
        characters: form.characters,
        exits: form.exits.filter((entry) => form.characters.includes(entry)),
        via: form.via.length ? form.via : undefined,
        flashback: form.flashback || undefined,
        image: form.image,
        suggestedPicture: blank(form.suggestedPicture),
        wikiUrl: blank(form.wikiUrl),
      };
      if (!value.exits?.length) value.exits = undefined;
      const beforeIndex = siblings.findIndex((timed) => timed.event.id === form.before);
      const position = beforeIndex >= 0 ? beforeIndex : siblings.length;
      const saved = id ? await api.update(bundle.saga.id, 'events', id, value, position) : await api.create(bundle.saga.id, 'events', value, position);
      useStore.getState().setEpisode(saved.episodeId);
      await finish('event', saved.id);
    });

  const remove = () =>
    task.run(async () => {
      if (id && (await removeEntry(bundle.saga.id, 'events', id, form.title))) await finish(null, null);
    });

  return (
    <FormShell onSubmit={save} busy={task.busy} error={task.error} onDelete={id ? remove : undefined}>
      <TextField label="Title" value={form.title} onChange={(value) => set('title', value)} required />
      <div className="form__pair">
        <SelectField
          label="Episode"
          value={form.episodeId}
          onChange={(value) => setForm((current) => ({ ...current, episodeId: value, before: '' }))}
          options={timeline.episodes.map((ref) => ({ value: ref.id, label: `${ref.code} · ${ref.episode.title}` }))}
        />
        <SelectField
          label="Comes"
          value={form.before}
          onChange={(value) => set('before', value)}
          options={[...siblings.map((timed) => ({ value: timed.event.id, label: `before: ${timed.event.title}` })), { value: '', label: 'last in the episode' }]}
        />
      </div>
      <div className="form__pair">
        <SelectField label="Storyline" value={form.storylineId} onChange={(value) => set('storylineId', value)} options={bundle.saga.storylines.map((storyline) => ({ value: storyline.id, label: storyline.title }))} />
        <SelectField
          label="Symbol"
          value={form.icon}
          onChange={(value) => set('icon', value)}
          options={[{ value: '', label: 'Automatic' }, ...ICON_NAMES.map((name) => ({ value: name, label: EVENT_ICONS[name].label }))]}
        />
      </div>
      <SelectField label="Kind" value={form.importance} onChange={(value) => set('importance', value as StoryEvent['importance'])} options={IMPORTANCE.map((value) => ({ value, label: IMPORTANCE_LABEL[value] }))} />
      <SelectField
        label="Where"
        value={form.placeId}
        onChange={(value) => set('placeId', value)}
        options={[{ value: '', label: '— a free spot on the map —' }, ...[...bundle.places].sort((a, b) => a.name.localeCompare(b.name)).map((entry) => ({ value: entry.id, label: entry.name }))]}
        hint={form.placeId ? undefined : 'Pick the spot on the map below, or choose a named place.'}
      />
      {!form.placeId && <PositionPicker pos={form.pos} label="Spot on the map" />}
      <TextArea label="What happens" value={form.description} onChange={(value) => set('description', value)} rows={5} />

      <div className="field">
        <span className="field__label">Who takes part (their portraits move here)</span>
        <div className="chips">
          {bundle.characters.map((character) => (
            <button key={character.id} type="button" className={`chip chip--toggle${form.characters.includes(character.id) ? ' is-selected' : ''}`} aria-pressed={form.characters.includes(character.id)} onClick={() => set('characters', toggle(form.characters, character.id))}>
              {character.name}
            </button>
          ))}
        </div>
      </div>
      {form.characters.length > 0 && (
        <div className="field">
          <span className="field__label">Who leaves the map after this (death, disappearance)</span>
          <div className="chips">
            {form.characters.map((characterId) => (
              <button key={characterId} type="button" className={`chip chip--toggle${form.exits.includes(characterId) ? ' is-selected' : ''}`} aria-pressed={form.exits.includes(characterId)} onClick={() => set('exits', toggle(form.exits, characterId))}>
                {timeline.characterById.get(characterId)?.name ?? characterId}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <span className="field__label">Route taken to get here (optional)</span>
        <div className="form__row">
          <button type="button" className={`button${pick === 'via' ? ' is-on' : ''}`} onClick={() => setPick(pick === 'via' ? null : 'via')}>
            <Route aria-hidden="true" /> {pick === 'via' ? 'Click the map… (click here when done)' : 'Add route points'}
          </button>
          {form.via.length > 0 && (
            <>
              <span className="muted">{form.via.length} point{form.via.length === 1 ? '' : 's'}</span>
              <button type="button" className="text-button" onClick={() => set('via', form.via.slice(0, -1))}>
                Undo
              </button>
              <button type="button" className="text-button" onClick={() => set('via', [])}>
                Clear
              </button>
            </>
          )}
        </div>
        <small className="field__hint">Points passed on the way, in order. Used by the characters who arrive from that direction.</small>
      </div>

      <label className="check">
        <input type="checkbox" checked={form.flashback} onChange={(event) => set('flashback', event.target.checked)} />
        A flashback or vision (shown, but nobody travels there)
      </label>
      <ImageField label="Picture" value={form.image} onChange={(value) => set('image', value)} suggestion={blank(form.suggestedPicture)} />
      <TextField label="Wiki link" type="url" value={form.wikiUrl} onChange={(value) => set('wikiUrl', value)} placeholder="https://lotr.fandom.com/wiki/…" />
      <TextField label="Link to a fitting still (optional)" type="url" value={form.suggestedPicture} onChange={(value) => set('suggestedPicture', value)} hint="Shown as a link while the event has no picture of its own." />
    </FormShell>
  );
}

/* --------------------------------------------------------------- character */

export function CharacterForm({ id }: { id: string | null }) {
  const bundle = useStore((state) => state.bundle)!;
  const timeline = useStore((state) => state.timeline)!;
  const original = id ? timeline.characterById.get(id) : undefined;
  const task = useTask();
  const [form, setForm] = useState({
    name: original?.name ?? '',
    group: original?.group ?? '',
    storylineId: original?.storylineId ?? '',
    playedBy: original?.playedBy ?? '',
    description: original?.description ?? '',
    wikiUrl: original?.wikiUrl ?? '',
    image: original?.image,
    suggestedPicture: original?.suggestedPicture ?? '',
    reveals: (original?.reveals ?? []) as Reveal[],
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setReveal = (index: number, change: Partial<Reveal>) => set('reveals', form.reveals.map((reveal, i) => (i === index ? { ...reveal, ...change } : reveal)));
  const groups = [...new Set(bundle.characters.map((character) => character.group).filter(Boolean))] as string[];

  const save = () =>
    task.run(async () => {
      const value: Partial<Character> = {
        name: form.name,
        group: blank(form.group),
        storylineId: form.storylineId || undefined,
        playedBy: blank(form.playedBy),
        description: blank(form.description),
        wikiUrl: blank(form.wikiUrl),
        image: form.image,
        suggestedPicture: blank(form.suggestedPicture),
        reveals: form.reveals.length
          ? form.reveals.map((reveal) => ({ ...reveal, name: blank(reveal.name), description: blank(reveal.description), wikiUrl: blank(reveal.wikiUrl), playedBy: blank(reveal.playedBy) }))
          : undefined,
      };
      const saved = id ? await api.update(bundle.saga.id, 'characters', id, value) : await api.create(bundle.saga.id, 'characters', value);
      await finish('character', saved.id);
    });
  const remove = () =>
    task.run(async () => {
      if (id && (await removeEntry(bundle.saga.id, 'characters', id, form.name))) await finish(null, null);
    });

  return (
    <FormShell onSubmit={save} busy={task.busy} error={task.error} onDelete={id ? remove : undefined}>
      <TextField label="Name" value={form.name} onChange={(value) => set('name', value)} required hint="The name as first known. A secret identity goes under “Reveals” below." />
      <div className="form__pair">
        <Field label="Group">
          <input type="text" list="character-groups" value={form.group} onChange={(event) => set('group', event.target.value)} placeholder="Elves, Dwarves…" />
          <datalist id="character-groups">
            {groups.map((group) => (
              <option key={group} value={group} />
            ))}
          </datalist>
        </Field>
        <SelectField
          label="Colour of the storyline"
          value={form.storylineId}
          onChange={(value) => set('storylineId', value)}
          options={[{ value: '', label: 'None' }, ...bundle.saga.storylines.map((storyline) => ({ value: storyline.id, label: storyline.title }))]}
        />
      </div>
      <TextField label="Played by" value={form.playedBy} onChange={(value) => set('playedBy', value)} />
      <TextArea label="Description" value={form.description} onChange={(value) => set('description', value)} />
      <ImageField label="Portrait" value={form.image} onChange={(value) => set('image', value)} round suggestion={blank(form.suggestedPicture)} />
      <TextField label="Wiki link" type="url" value={form.wikiUrl} onChange={(value) => set('wikiUrl', value)} hint="Leave empty if the wiki page itself would give away a secret; put it in the reveal instead." />
      <TextField label="Link to a fitting still (optional)" type="url" value={form.suggestedPicture} onChange={(value) => set('suggestedPicture', value)} />

      <div className="field">
        <span className="field__label">Reveals (a new name or actor from some episode on)</span>
        {form.reveals.map((reveal, index) => (
          <div className="form__card" key={index}>
            <div className="form__pair">
              <SelectField label="From" value={reveal.from} onChange={(value) => setReveal(index, { from: value, event: undefined })} options={timeline.episodes.map((ref) => ({ value: ref.id, label: ref.code }))} />
              <SelectField
                label="At the event"
                value={reveal.event ?? ''}
                onChange={(value) => setReveal(index, { event: value || undefined })}
                options={[{ value: '', label: 'start of the episode' }, ...(timeline.eventsByEpisode.get(reveal.from) ?? []).map((timed) => ({ value: timed.event.id, label: timed.event.title }))]}
              />
            </div>
            <TextField label="New name" value={reveal.name} onChange={(value) => setReveal(index, { name: value })} />
            <TextField label="New actor (if recast)" value={reveal.playedBy} onChange={(value) => setReveal(index, { playedBy: value })} />
            <TextField label="Wiki link from then on" type="url" value={reveal.wikiUrl} onChange={(value) => setReveal(index, { wikiUrl: value })} />
            <TextArea label="Description from then on" value={reveal.description} onChange={(value) => setReveal(index, { description: value })} rows={2} />
            <button type="button" className="text-button" onClick={() => set('reveals', form.reveals.filter((_, i) => i !== index))}>
              <X aria-hidden="true" /> Remove this reveal
            </button>
          </div>
        ))}
        <button type="button" className="button" onClick={() => set('reveals', [...form.reveals, { from: timeline.episodes[0]?.id ?? '' }])}>
          <Plus aria-hidden="true" /> Add a reveal
        </button>
      </div>
    </FormShell>
  );
}

/* ------------------------------------------------------------------- place */

export function PlaceForm({ id }: { id: string | null }) {
  const bundle = useStore((state) => state.bundle)!;
  const timeline = useStore((state) => state.timeline)!;
  const setDraftShape = useStore((state) => state.setDraftShape);
  const original = id ? timeline.placeById.get(id) : undefined;
  const task = useTask();
  const [form, setForm] = useState({
    name: original?.name ?? '',
    kind: original?.kind ?? ('other' as Place['kind']),
    pos: original?.pos,
    description: original?.description ?? '',
    wikiUrl: original?.wikiUrl ?? '',
    image: original?.image,
    suggestedPicture: original?.suggestedPicture ?? '',
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  usePicked((point) => set('pos', point));
  useEffect(() => {
    setDraftShape({ pos: form.pos, color: '#6b5b45' });
    return () => setDraftShape(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.pos?.[0], form.pos?.[1]]);

  const save = () =>
    task.run(async () => {
      const value: Partial<Place> = {
        name: form.name,
        kind: form.kind,
        pos: form.pos,
        description: blank(form.description),
        wikiUrl: blank(form.wikiUrl),
        image: form.image,
        suggestedPicture: blank(form.suggestedPicture),
      };
      const saved = id ? await api.update(bundle.saga.id, 'places', id, value) : await api.create(bundle.saga.id, 'places', value);
      await finish('place', saved.id);
    });
  const remove = () =>
    task.run(async () => {
      if (id && (await removeEntry(bundle.saga.id, 'places', id, form.name))) await finish(null, null);
    });

  return (
    <FormShell onSubmit={save} busy={task.busy} error={task.error} onDelete={id ? remove : undefined}>
      <TextField label="Name" value={form.name} onChange={(value) => set('name', value)} required />
      <SelectField label="Kind" value={form.kind} onChange={(value) => set('kind', value as Place['kind'])} options={PLACE_KINDS.map((kind) => ({ value: kind, label: kind[0].toUpperCase() + kind.slice(1) }))} />
      <PositionPicker pos={form.pos} />
      <TextArea label="Description" value={form.description} onChange={(value) => set('description', value)} />
      <ImageField label="Picture" value={form.image} onChange={(value) => set('image', value)} suggestion={blank(form.suggestedPicture)} />
      <TextField label="Wiki link" type="url" value={form.wikiUrl} onChange={(value) => set('wikiUrl', value)} />
      <TextField label="Link to a fitting still (optional)" type="url" value={form.suggestedPicture} onChange={(value) => set('suggestedPicture', value)} />
    </FormShell>
  );
}

/* -------------------------------------------------------------------- saga */

export function SagaForm() {
  const bundle = useStore((state) => state.bundle)!;
  const task = useTask();
  const [saga, setSaga] = useState<Saga>(() => structuredClone(bundle.saga));
  const change = (edit: (draft: Saga) => void) =>
    setSaga((current) => {
      const draft = structuredClone(current);
      edit(draft);
      return draft;
    });
  const setEpisode = (seasonIndex: number, episodeIndex: number, patch: Partial<Episode>) => change((draft) => Object.assign(draft.seasons[seasonIndex].episodes[episodeIndex], patch));

  const save = () =>
    task.run(async () => {
      const tidy: Saga = {
        ...saga,
        subtitle: blank(saga.subtitle),
        seasons: saga.seasons.map((season) => ({
          ...season,
          episodes: season.episodes.map((episode) => ({ ...episode, airDate: blank(episode.airDate), synopsis: blank(episode.synopsis), wikiUrl: blank(episode.wikiUrl) })),
        })),
      };
      await api.saveSaga(tidy);
      await finish(null, null);
    });

  return (
    <FormShell onSubmit={save} busy={task.busy} error={task.error}>
      <TextField label="Title" value={saga.title} onChange={(value) => change((draft) => void (draft.title = value))} required />
      <TextField label="Subtitle" value={saga.subtitle} onChange={(value) => change((draft) => void (draft.subtitle = value))} />

      {saga.seasons.map((season, seasonIndex) => (
        <div className="form__card" key={season.id || `new-${seasonIndex}`}>
          <TextField label="Season" value={season.title} onChange={(value) => change((draft) => void (draft.seasons[seasonIndex].title = value))} />
          {season.episodes.map((episode, episodeIndex) => (
            <details className="episode-row" key={episode.id || `new-${episodeIndex}`}>
              <summary>
                <span className="episode-row__number">{episodeIndex + 1}</span>
                <input type="text" value={episode.title} aria-label={`Title of episode ${episodeIndex + 1}`} onChange={(event) => setEpisode(seasonIndex, episodeIndex, { title: event.target.value })} onClick={(event) => event.stopPropagation()} />
                <span className="episode-row__more">more</span>
              </summary>
              <TextField label="First shown" type="date" value={episode.airDate} onChange={(value) => setEpisode(seasonIndex, episodeIndex, { airDate: value })} />
              <TextArea label="Synopsis" value={episode.synopsis} onChange={(value) => setEpisode(seasonIndex, episodeIndex, { synopsis: value })} rows={2} />
              <TextField label="Wiki link" type="url" value={episode.wikiUrl} onChange={(value) => setEpisode(seasonIndex, episodeIndex, { wikiUrl: value })} />
              <button type="button" className="text-button" onClick={() => change((draft) => void draft.seasons[seasonIndex].episodes.splice(episodeIndex, 1))}>
                <X aria-hidden="true" /> Remove this episode (only possible while it has no events)
              </button>
            </details>
          ))}
          <button type="button" className="button" onClick={() => change((draft) => void draft.seasons[seasonIndex].episodes.push({ title: `Episode ${season.episodes.length + 1}` } as Episode))}>
            <Plus aria-hidden="true" /> Add an episode
          </button>
        </div>
      ))}
      <button type="button" className="button" onClick={() => change((draft) => void draft.seasons.push({ title: `Season ${saga.seasons.length + 1}`, episodes: [] } as unknown as Saga['seasons'][number]))}>
        <Plus aria-hidden="true" /> Add a season (or a film)
      </button>

      <div className="field">
        <span className="field__label">Storylines</span>
        {saga.storylines.map((storyline, index) => (
          <div className="form__row" key={storyline.id || `new-${index}`}>
            <input type="color" value={storyline.color} aria-label="Colour" onChange={(event) => change((draft) => void (draft.storylines[index].color = event.target.value))} />
            <input type="text" value={storyline.title} aria-label="Storyline title" onChange={(event) => change((draft) => void (draft.storylines[index].title = event.target.value))} />
            <button type="button" className="icon-button icon-button--small" aria-label="Remove this storyline" title="Remove (only possible while unused)" onClick={() => change((draft) => void draft.storylines.splice(index, 1))}>
              <X aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button" className="button" onClick={() => change((draft) => void draft.storylines.push({ title: 'New storyline', color: '#6b5b45' } as Saga['storylines'][number]))}>
          <Plus aria-hidden="true" /> Add a storyline
        </button>
      </div>
    </FormShell>
  );
}
