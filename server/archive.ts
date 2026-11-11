/**
 * Export and import of everything as one zip file, for moving the project to
 * another machine or keeping a copy somewhere safe.
 *
 *   sagas/...            the story data
 *   maps/...             map descriptions
 *   media/img/...        pictures (portraits, uploads)          - optional
 *   media/maps/<id>/source.*   the original map pictures        - optional, large
 *
 * Map tiles and shrunk pictures are left out: they are rebuilt from the originals.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { HttpError } from './errors.ts';
import type { Store } from './store.ts';

const PICTURE = /\.(jpe?g|png|webp|gif|avif)$/i;
/** What an archive may contain. Anything else in a zip is refused, so an import can never write outside these places. */
const ALLOWED = [
  /^sagas\/[a-z0-9-]+\/(saga|places|characters|overlays)\.json$/,
  /^sagas\/[a-z0-9-]+\/events\/[a-z0-9-]+\.json$/,
  /^maps\/[a-z0-9-]+\.json$/,
  /^media\/img\/(?:[A-Za-z0-9_][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_][A-Za-z0-9_.-]*\.(jpe?g|png|webp|gif|avif)$/i,
  /^media\/maps\/[a-z0-9-]+\/source\.(jpe?g|png|webp)$/i,
];

async function walk(dir: string, base = dir): Promise<string[]> {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full, base)));
    else files.push(path.relative(base, full).replaceAll('\\', '/'));
  }
  return files;
}

export async function exportArchive(store: Store, options: { pictures: boolean; mapPictures: boolean }): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const add = async (relative: string) => {
    if (ALLOWED.some((pattern) => pattern.test(relative))) files[relative] = await fsp.readFile(path.join(store.dataDir, relative));
  };
  for (const folder of ['sagas', 'maps']) {
    for (const file of await walk(path.join(store.dataDir, folder))) await add(`${folder}/${file}`);
  }
  if (options.pictures) {
    for (const file of await walk(path.join(store.mediaDir, 'img'))) await add(`media/img/${file}`);
  }
  if (options.mapPictures) {
    for (const file of await walk(path.join(store.mediaDir, 'maps'))) {
      if (/^[a-z0-9-]+\/source\./.test(file)) await add(`media/maps/${file}`);
    }
  }
  // Pictures are already compressed; storing them as they are is much faster.
  return zipSync(files, { level: 0 });
}

export interface ImportResult {
  dataFiles: number;
  pictures: number;
}

/** Unpacks an exported zip over the current data. A backup of the data files is made first. */
export async function importArchive(store: Store, zip: Uint8Array): Promise<ImportResult> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch {
    throw new HttpError(400, 'This is not a zip file the app can read.');
  }
  const names = Object.keys(entries).filter((name) => !name.endsWith('/'));
  if (names.length === 0) throw new HttpError(400, 'The zip file is empty.');
  const unexpected = names.filter((name) => name.includes('..') || path.isAbsolute(name) || !ALLOWED.some((pattern) => pattern.test(name)));
  if (unexpected.length) {
    throw new HttpError(400, 'The zip contains files that do not belong to an export of this app; nothing was imported.', unexpected.slice(0, 10));
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(entries[name]).replace(/^﻿/, ''));
    } catch {
      throw new HttpError(400, `${name} in the zip is not valid JSON; nothing was imported.`);
    }
  }

  await store.snapshot('before-import');
  const result: ImportResult = { dataFiles: 0, pictures: 0 };
  for (const name of names) {
    const target = path.join(store.dataDir, name);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, entries[name]);
    if (PICTURE.test(name)) result.pictures++;
    else result.dataFiles++;
  }
  return result;
}
