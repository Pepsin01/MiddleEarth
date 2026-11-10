/**
 * Reads and writes the story data in the data folder:
 *
 *   data/maps/<mapId>.json
 *   data/sagas/<sagaId>/saga.json          title, seasons + episodes, storylines
 *   data/sagas/<sagaId>/places.json
 *   data/sagas/<sagaId>/characters.json
 *   data/sagas/<sagaId>/overlays.json
 *   data/sagas/<sagaId>/events/<episodeId>.json   events of one episode, in story order
 *
 * Reading is forgiving: a broken entry is reported as a "problem" and skipped,
 * so one typo made while editing a file by hand does not take the app down.
 * Writing only ever touches the entry being changed and leaves all other
 * entries in the file exactly as they were.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { z } from 'zod';
import { slugify, uniqueId } from '../shared/ids.ts';
import { Character, Id, MapDef, Overlay, Place, Saga, StoredEvent, StoryEvent } from '../shared/schema.ts';
import type { CollectionName, SagaBundle, SagaSummary } from '../shared/schema.ts';
import { listEpisodes } from '../shared/timeline.ts';
import { characterProblems, checkReferences, eventProblems, overlayProblems, placeProblems, refContext, sagaProblems } from '../shared/validate.ts';
import { HttpError, issueList, parseOrThrow } from './errors.ts';
import { formatJson } from './json-format.ts';

type Raw = Record<string, unknown>;
type ListName = Exclude<CollectionName, 'events'>;
export type SaveMode = 'create' | 'update';

const LIST_SCHEMAS = { places: Place, characters: Character, overlays: Overlay } as const;

export interface BackupInfo {
  name: string;
  createdAt: string;
  label: string;
}

const BACKUP_NAME = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(?:--([a-z0-9-]+))?$/;

function isObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): Raw {
  if (!isObject(value)) throw new HttpError(400, 'Expected an object with fields.');
  return { ...value };
}

function omit<T extends Raw, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function errorCode(error: unknown): string | undefined {
  return isObject(error) && typeof error.code === 'string' ? error.code : undefined;
}

export class Store {
  readonly dataDir: string;
  private readonly maxBackups: number;
  private queue: Promise<unknown> = Promise.resolve();
  private lastSnapshot = 0;

  constructor(dataDir: string, maxBackups = 40) {
    this.dataDir = dataDir;
    this.maxBackups = maxBackups;
  }

  get mediaDir(): string {
    return path.join(this.dataDir, 'media');
  }

  get backupDir(): string {
    return path.join(this.dataDir, 'backups');
  }

  private sagaDir(sagaId: string): string {
    if (!Id.safeParse(sagaId).success) throw new HttpError(404, 'No such saga.');
    return path.join(this.dataDir, 'sagas', sagaId);
  }

  private eventFile(sagaId: string, episodeId: string): string {
    return path.join(this.sagaDir(sagaId), 'events', `${episodeId}.json`);
  }

  private rel(file: string): string {
    return path.relative(this.dataDir, file).replaceAll('\\', '/');
  }

  /** Runs tasks that change files one after another, never at the same time. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /* ------------------------------------------------------------ low level */

  private async readText(file: string): Promise<string | null> {
    try {
      const text = await fs.readFile(file, 'utf8');
      return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // tolerate a byte-order mark added by some editors
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return null;
      throw error;
    }
  }

  /**
   * Reads a file containing a list. A missing file counts as an empty list.
   * An unreadable file is reported in `problems` when given, otherwise it stops the operation -
   * we never want to overwrite a file we could not understand.
   */
  private async readList(file: string, problems?: string[]): Promise<Raw[]> {
    const text = await this.readText(file);
    if (text === null) return [];
    try {
      const value: unknown = JSON.parse(text);
      if (!Array.isArray(value)) throw new Error('it should contain a list [ ... ]');
      return value as Raw[];
    } catch (error) {
      const message = `${this.rel(file)} could not be read: ${(error as Error).message}`;
      if (problems) {
        problems.push(message);
        return [];
      }
      throw new HttpError(409, `${message}. Fix the file by hand or restore a backup before editing.`);
    }
  }

  private async writeJson(file: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    await fs.writeFile(temporary, formatJson(value), 'utf8');
    await fs.rename(temporary, file);
  }

  private parseList<T extends z.ZodType>(schema: T, raw: Raw[], file: string, problems: string[]): z.infer<T>[] {
    const items: z.infer<T>[] = [];
    raw.forEach((entry, index) => {
      const result = schema.safeParse(entry);
      if (result.success) {
        items.push(result.data);
      } else {
        const label = isObject(entry) && typeof entry.id === 'string' ? `"${entry.id}"` : `entry ${index + 1}`;
        problems.push(`${this.rel(file)}, ${label} was skipped: ${issueList(result.error).join('; ')}`);
      }
    });
    return items;
  }

  /* ---------------------------------------------------------------- reading */

  async loadMap(mapId: string): Promise<MapDef> {
    if (!Id.safeParse(mapId).success) throw new HttpError(404, 'No such map.');
    const file = path.join(this.dataDir, 'maps', `${mapId}.json`);
    const text = await this.readText(file);
    if (text === null) throw new HttpError(404, `The map "${mapId}" does not exist (${this.rel(file)}).`);
    try {
      return parseOrThrow(MapDef, JSON.parse(text));
    } catch (error) {
      const details = error instanceof HttpError ? error.details : [(error as Error).message];
      throw new HttpError(500, `${this.rel(file)} is not valid.`, details);
    }
  }

  async listMaps(): Promise<MapDef[]> {
    const maps: MapDef[] = [];
    for (const name of await this.listDir(path.join(this.dataDir, 'maps'))) {
      if (!name.endsWith('.json')) continue;
      try {
        maps.push(await this.loadMap(name.slice(0, -5)));
      } catch (error) {
        console.warn(`Skipping map ${name}: ${(error as Error).message}`);
      }
    }
    return maps;
  }

  private async listDir(dir: string): Promise<string[]> {
    try {
      return (await fs.readdir(dir)).sort();
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return [];
      throw error;
    }
  }

  private async loadSaga(sagaId: string): Promise<Saga> {
    const file = path.join(this.sagaDir(sagaId), 'saga.json');
    const text = await this.readText(file);
    if (text === null) throw new HttpError(404, `The saga "${sagaId}" does not exist.`);
    try {
      return parseOrThrow(Saga, JSON.parse(text));
    } catch (error) {
      const details = error instanceof HttpError ? error.details : [(error as Error).message];
      throw new HttpError(500, `${this.rel(file)} is not valid.`, details);
    }
  }

  async loadBundle(sagaId: string): Promise<SagaBundle> {
    const dir = this.sagaDir(sagaId);
    const saga = await this.loadSaga(sagaId);
    const map = await this.loadMap(saga.mapId);
    const problems: string[] = [];

    const list = async <T extends z.ZodType>(name: ListName, schema: T) => {
      const file = path.join(dir, `${name}.json`);
      return this.parseList(schema, await this.readList(file, problems), file, problems);
    };
    const places = await list('places', Place);
    const characters = await list('characters', Character);
    const overlays = await list('overlays', Overlay);

    const events: StoryEvent[] = [];
    const episodeIds = new Set<string>();
    for (const { id: episodeId } of listEpisodes(saga)) {
      episodeIds.add(episodeId);
      const file = this.eventFile(sagaId, episodeId);
      for (const event of this.parseList(StoredEvent, await this.readList(file, problems), file, problems)) {
        events.push({ ...event, episodeId });
      }
    }
    for (const name of await this.listDir(path.join(dir, 'events'))) {
      if (name.endsWith('.json') && !episodeIds.has(name.slice(0, -5))) {
        problems.push(`events/${name} is ignored: there is no episode with the id "${name.slice(0, -5)}" in saga.json.`);
      }
    }

    problems.push(...checkReferences({ saga, map, places, characters, events, overlays }));
    return { saga, map, places, characters, events, overlays, problems };
  }

  async listSagas(): Promise<SagaSummary[]> {
    const summaries: SagaSummary[] = [];
    for (const name of await this.listDir(path.join(this.dataDir, 'sagas'))) {
      if (!Id.safeParse(name).success) continue;
      try {
        const bundle = await this.loadBundle(name);
        summaries.push({
          id: bundle.saga.id,
          title: bundle.saga.title,
          subtitle: bundle.saga.subtitle,
          mapId: bundle.saga.mapId,
          episodes: listEpisodes(bundle.saga).length,
          events: bundle.events.length,
        });
      } catch (error) {
        if (!(error instanceof HttpError && error.status === 404)) {
          console.warn(`Skipping saga "${name}": ${(error as Error).message}`);
        }
      }
    }
    return summaries;
  }

  /* ---------------------------------------------------------------- writing */

  /** Creates or replaces one place, character or overlay. */
  saveItem<N extends ListName>(sagaId: string, collection: N, input: unknown, mode: SaveMode, id?: string): Promise<z.infer<(typeof LIST_SCHEMAS)[N]>> {
    return this.exclusive(async () => {
      const bundle = await this.loadBundle(sagaId);
      const file = path.join(this.sagaDir(sagaId), `${collection}.json`);
      const raw = await this.readList(file);
      const ids = raw.map((entry) => String(entry?.id ?? ''));

      const candidate = asObject(input);
      if (mode === 'create') {
        if (!candidate.id) {
          candidate.id = uniqueId(slugify(String(candidate.name ?? candidate.title ?? collection)), ids);
        } else if (ids.includes(String(candidate.id))) {
          throw new HttpError(409, `There already is an entry with the id "${String(candidate.id)}".`);
        }
      } else {
        if (!id || !ids.includes(id)) throw new HttpError(404, `There is no entry with the id "${id}".`);
        candidate.id = id;
      }

      const item = parseOrThrow(LIST_SCHEMAS[collection], candidate) as z.infer<(typeof LIST_SCHEMAS)[N]>;
      const context = refContext(bundle);
      const problems =
        collection === 'places'
          ? placeProblems(item as Place, context)
          : collection === 'characters'
            ? characterProblems(item as Character, context)
            : overlayProblems(item as Overlay, context);
      if (problems.length) throw new HttpError(400, 'This entry does not fit the rest of the data.', problems);

      const index = ids.indexOf(item.id);
      if (index >= 0) raw[index] = item;
      else raw.push(item);

      await this.snapshot(`${mode}-${collection}`);
      await this.writeJson(file, raw);
      return item;
    });
  }

  private async readEventFiles(sagaId: string, saga: Saga): Promise<Map<string, Raw[]>> {
    const files = new Map<string, Raw[]>();
    for (const { id } of listEpisodes(saga)) files.set(id, await this.readList(this.eventFile(sagaId, id)));
    return files;
  }

  /** Creates or replaces an event. `position` is its place in the episode (0 = first); by default new events go last. */
  saveEvent(sagaId: string, input: unknown, mode: SaveMode, id?: string, position?: number): Promise<StoryEvent> {
    return this.exclusive(async () => {
      const bundle = await this.loadBundle(sagaId);
      const files = await this.readEventFiles(sagaId, bundle.saga);
      const locate = (eventId: string) => {
        for (const [episodeId, list] of files) {
          const index = list.findIndex((entry) => entry?.id === eventId);
          if (index >= 0) return { episodeId, index };
        }
        return null;
      };

      const candidate = asObject(input);
      const episodeId = String(candidate.episodeId ?? '');
      if (!files.has(episodeId)) throw new HttpError(400, `There is no episode with the id "${episodeId}".`);

      if (mode === 'create') {
        if (!candidate.id) {
          const taken = [...files.values()].flatMap((list) => list.map((entry) => String(entry?.id ?? '')));
          candidate.id = uniqueId(slugify(`${episodeId}-${String(candidate.title ?? 'event')}`, 70), taken);
        } else if (locate(String(candidate.id))) {
          throw new HttpError(409, `There already is an event with the id "${String(candidate.id)}".`);
        }
      } else {
        candidate.id = id;
      }

      const event = parseOrThrow(StoryEvent, candidate);
      const previous = locate(event.id);
      if (mode === 'update' && !previous) throw new HttpError(404, `There is no event with the id "${event.id}".`);

      const problems = eventProblems(event, refContext(bundle));
      if (problems.length) throw new HttpError(400, 'This event does not fit the rest of the data.', problems);

      const changed = new Set<string>([event.episodeId]);
      let index = position;
      if (previous) {
        files.get(previous.episodeId)!.splice(previous.index, 1);
        changed.add(previous.episodeId);
        if (index === undefined && previous.episodeId === event.episodeId) index = previous.index;
      }
      const target = files.get(event.episodeId)!;
      if (index === undefined || index > target.length) index = target.length;
      target.splice(Math.max(0, index), 0, omit(event, 'episodeId'));

      await this.snapshot(`${mode}-event`);
      for (const changedId of changed) await this.writeJson(this.eventFile(sagaId, changedId), files.get(changedId));
      return event;
    });
  }

  /** Puts the events of one episode into the given order. */
  reorderEvents(sagaId: string, episodeId: string, ids: string[]): Promise<void> {
    return this.exclusive(async () => {
      const saga = await this.loadSaga(sagaId);
      if (!listEpisodes(saga).some((episode) => episode.id === episodeId)) {
        throw new HttpError(404, `There is no episode with the id "${episodeId}".`);
      }
      const file = this.eventFile(sagaId, episodeId);
      const raw = await this.readList(file);
      const byId = new Map(raw.map((entry) => [String(entry?.id ?? ''), entry]));
      if (ids.length !== raw.length || new Set(ids).size !== ids.length || !ids.every((eventId) => byId.has(eventId))) {
        throw new HttpError(400, 'The new order must list every event of the episode exactly once.');
      }
      await this.snapshot('reorder-events');
      await this.writeJson(file, ids.map((eventId) => byId.get(eventId)));
    });
  }

  /**
   * Deletes an entry. Places and characters that are still used by events are only
   * deleted with `cascade`: events then keep their spot on the map as a free position,
   * and a deleted character is taken out of all events.
   */
  removeItem(sagaId: string, collection: CollectionName, id: string, cascade = false): Promise<void> {
    return this.exclusive(async () => {
      const bundle = await this.loadBundle(sagaId);
      const dir = this.sagaDir(sagaId);
      const files = await this.readEventFiles(sagaId, bundle.saga);
      const changedEpisodes = new Set<string>();
      const writes: Array<[string, unknown]> = [];

      const editList = async (name: ListName, edit: (raw: Raw[]) => boolean) => {
        const file = path.join(dir, `${name}.json`);
        const raw = await this.readList(file);
        if (edit(raw)) writes.push([file, raw]);
      };
      const dropFrom = (raw: Raw[]): boolean => {
        const index = raw.findIndex((entry) => entry?.id === id);
        if (index < 0) throw new HttpError(404, `There is no entry with the id "${id}".`);
        raw.splice(index, 1);
        return true;
      };

      if (collection === 'events') {
        let found = false;
        for (const [episodeId, list] of files) {
          const index = list.findIndex((entry) => entry?.id === id);
          if (index >= 0) {
            list.splice(index, 1);
            changedEpisodes.add(episodeId);
            found = true;
          }
        }
        if (!found) throw new HttpError(404, `There is no event with the id "${id}".`);
        // Reveals and overlays that were timed by this event fall back to their episode.
        await editList('characters', (raw) => {
          let touched = false;
          for (const entry of raw) {
            if (!Array.isArray(entry?.reveals)) continue;
            for (const reveal of entry.reveals as Raw[]) {
              if (reveal?.event === id) {
                delete reveal.event;
                touched = true;
              }
            }
          }
          return touched;
        });
        await editList('overlays', (raw) => {
          let touched = false;
          for (const entry of raw) {
            for (const key of ['fromEvent', 'untilEvent']) {
              if (entry?.[key] === id) {
                delete entry[key];
                touched = true;
              }
            }
          }
          return touched;
        });
      } else if (collection === 'places') {
        const place = bundle.places.find((entry) => entry.id === id);
        const users = bundle.events.filter((event) => event.placeId === id);
        if (users.length && !cascade) {
          throw new HttpError(409, `This place is used by ${users.length} event${users.length === 1 ? '' : 's'}.`, users.map((event) => event.title));
        }
        for (const [episodeId, list] of files) {
          for (const entry of list) {
            if (entry?.placeId !== id) continue;
            if (!entry.pos && place) entry.pos = place.pos;
            delete entry.placeId;
            changedEpisodes.add(episodeId);
          }
        }
        await editList('places', dropFrom);
      } else if (collection === 'characters') {
        const users = bundle.events.filter((event) => event.characters.includes(id));
        if (users.length && !cascade) {
          throw new HttpError(409, `This character takes part in ${users.length} event${users.length === 1 ? '' : 's'}.`, users.map((event) => event.title));
        }
        for (const [episodeId, list] of files) {
          for (const entry of list) {
            for (const key of ['characters', 'exits']) {
              const value = entry?.[key];
              if (Array.isArray(value) && value.includes(id)) {
                entry[key] = value.filter((item) => item !== id);
                changedEpisodes.add(episodeId);
              }
            }
          }
        }
        await editList('characters', dropFrom);
      } else {
        await editList('overlays', dropFrom);
      }

      await this.snapshot(`delete-${collection}`);
      for (const episodeId of changedEpisodes) await this.writeJson(this.eventFile(sagaId, episodeId), files.get(episodeId));
      for (const [file, value] of writes) await this.writeJson(file, value);
    });
  }

  /** Saves title, seasons, episodes and storylines. Episodes and storylines still in use cannot be removed. */
  saveSaga(sagaId: string, input: unknown): Promise<Saga> {
    return this.exclusive(async () => {
      const bundle = await this.loadBundle(sagaId);
      const saga = this.prepareSaga({ ...asObject(input), id: sagaId });
      await this.loadMap(saga.mapId);

      const kept = new Set(listEpisodes(saga).map((episode) => episode.id));
      for (const { id: episodeId, episode } of listEpisodes(bundle.saga)) {
        if (kept.has(episodeId)) continue;
        const count = (await this.readList(this.eventFile(sagaId, episodeId))).length;
        if (count) {
          throw new HttpError(409, `"${episode.title}" still has ${count} event${count === 1 ? '' : 's'}. Move or delete them before removing the episode.`);
        }
      }
      const storylines = new Set(saga.storylines.map((storyline) => storyline.id));
      const inUse = [...bundle.events.map((event) => event.storylineId), ...bundle.characters.map((character) => character.storylineId)];
      for (const storylineId of new Set(inUse)) {
        if (storylineId && !storylines.has(storylineId)) {
          throw new HttpError(409, `The storyline "${storylineId}" is still used by events or characters and cannot be removed.`);
        }
      }

      await this.snapshot('edit-saga');
      await this.writeJson(path.join(this.sagaDir(sagaId), 'saga.json'), saga);
      return saga;
    });
  }

  /** Creates a new, empty saga (for another series or the films). */
  createSaga(input: unknown): Promise<Saga> {
    return this.exclusive(async () => {
      const candidate = asObject(input);
      const existing = await this.listDir(path.join(this.dataDir, 'sagas'));
      if (!candidate.id) candidate.id = uniqueId(slugify(String(candidate.title ?? 'saga')), existing);
      else if (existing.includes(String(candidate.id))) throw new HttpError(409, `There already is a saga with the id "${String(candidate.id)}".`);
      const saga = this.prepareSaga({ seasons: [], storylines: [], ...candidate });
      await this.loadMap(saga.mapId);

      await this.snapshot('create-saga');
      const dir = this.sagaDir(saga.id);
      await this.writeJson(path.join(dir, 'saga.json'), saga);
      for (const name of ['places', 'characters', 'overlays']) await this.writeJson(path.join(dir, `${name}.json`), []);
      return saga;
    });
  }

  /** Gives ids to new seasons, episodes and storylines and checks the result. */
  private prepareSaga(candidate: Raw): Saga {
    const seasons = Array.isArray(candidate.seasons) ? (candidate.seasons as Raw[]).map((season) => ({ ...season })) : [];
    const seasonIds = seasons.map((season) => String(season.id ?? '')).filter(Boolean);
    const episodeIds = seasons.flatMap((season) =>
      Array.isArray(season.episodes) ? (season.episodes as Raw[]).map((episode) => String(episode?.id ?? '')).filter(Boolean) : [],
    );
    seasons.forEach((season, seasonIndex) => {
      if (!season.id) {
        season.id = uniqueId(`s${seasonIndex + 1}`, seasonIds);
        seasonIds.push(String(season.id));
      }
      season.episodes = (Array.isArray(season.episodes) ? (season.episodes as Raw[]) : []).map((episode, episodeIndex) => {
        if (episode?.id) return episode;
        const id = uniqueId(`${String(season.id)}e${episodeIndex + 1}`, episodeIds);
        episodeIds.push(id);
        return { ...episode, id };
      });
    });

    const storylines = Array.isArray(candidate.storylines) ? (candidate.storylines as Raw[]).map((storyline) => ({ ...storyline })) : [];
    const storylineIds = storylines.map((storyline) => String(storyline.id ?? '')).filter(Boolean);
    for (const storyline of storylines) {
      if (!storyline.id) {
        storyline.id = uniqueId(slugify(String(storyline.title ?? 'storyline')), storylineIds);
        storylineIds.push(String(storyline.id));
      }
    }

    const saga = parseOrThrow(Saga, { ...candidate, seasons, storylines });
    const problems = sagaProblems(saga);
    if (problems.length) throw new HttpError(400, 'The saga is not consistent.', problems);
    return saga;
  }

  /* ---------------------------------------------------------------- backups */

  /**
   * Copies all data files (not the pictures) into data/backups/<time>--<label>.
   * Called before every change, so any edit can be undone by restoring a backup.
   */
  async snapshot(label: string): Promise<string | null> {
    // Never reuse a timestamp, even for two saves within the same millisecond.
    this.lastSnapshot = Math.max(Date.now(), this.lastSnapshot + 1);
    const stamp = new Date(this.lastSnapshot).toISOString().replaceAll(':', '-').replace('.', '-');
    const name = `${stamp}--${slugify(label, 40)}`;
    const target = path.join(this.backupDir, name);
    let copied = false;
    for (const folder of ['sagas', 'maps']) {
      const source = path.join(this.dataDir, folder);
      try {
        await fs.cp(source, path.join(target, folder), { recursive: true });
        copied = true;
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') throw error;
      }
    }
    if (!copied) return null;
    await this.pruneBackups();
    return name;
  }

  async listBackups(): Promise<BackupInfo[]> {
    const backups: BackupInfo[] = [];
    for (const name of await this.listDir(this.backupDir)) {
      const match = BACKUP_NAME.exec(name);
      if (!match) continue;
      backups.push({
        name,
        createdAt: `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`,
        label: match[6] ?? '',
      });
    }
    return backups.sort((a, b) => (a.name < b.name ? 1 : -1));
  }

  /** Keeps the newest backups, plus one per day for older ones (up to 60 days). */
  private async pruneBackups(): Promise<void> {
    const backups = await this.listBackups();
    const daysKept = new Set<string>();
    const cutoff = Date.now() - 60 * 24 * 3600 * 1000;
    for (const [index, backup] of backups.entries()) {
      if (index < this.maxBackups) continue;
      const day = backup.createdAt.slice(0, 10);
      if (!daysKept.has(day) && Date.parse(backup.createdAt) >= cutoff) {
        daysKept.add(day);
        continue;
      }
      await fs.rm(path.join(this.backupDir, backup.name), { recursive: true, force: true });
    }
  }

  /** Brings the data files back to the state saved in a backup. The current state is backed up first. */
  restoreBackup(name: string): Promise<void> {
    return this.exclusive(async () => {
      if (!BACKUP_NAME.test(name)) throw new HttpError(404, 'No such backup.');
      const source = path.join(this.backupDir, name);
      if (!(await this.listDir(source)).length) throw new HttpError(404, 'No such backup.');
      await this.snapshot('before-restore');
      for (const folder of ['sagas', 'maps']) {
        const from = path.join(source, folder);
        if (!(await this.listDir(from)).length) continue;
        await fs.rm(path.join(this.dataDir, folder), { recursive: true, force: true });
        await fs.cp(from, path.join(this.dataDir, folder), { recursive: true });
      }
    });
  }
}
