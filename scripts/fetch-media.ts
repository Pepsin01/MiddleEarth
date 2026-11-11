/**
 * Downloads every picture the data refers to and cuts the maps into tiles.
 * Pictures are not stored in git, so run this once after cloning the project
 * (and again whenever the data mentions new pictures).
 *
 *   npm run media:fetch                 download whatever is missing
 *   npm run media:fetch -- --force      download everything again
 *   npm run media:fetch -- --no-tiles   skip building map tiles
 */
import { loadConfig } from '../server/config.ts';
import { exists, fetchSource, mediaFile } from '../server/media.ts';
import { Store } from '../server/store.ts';
import { buildTiles, tilesReady } from '../server/tiles.ts';
import { collectImages } from '../shared/images.ts';

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const withTiles = !args.has('--no-tiles');

const config = loadConfig();
const store = new Store(config.dataDir);
const failures: string[] = [];
let downloaded = 0;
let present = 0;

function megabytes(bytes: number): string {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

/** Downloads one picture unless it is already there. Returns whether a website was contacted. */
async function fetchOne(file: string, source: string): Promise<boolean> {
  const target = mediaFile(store.mediaDir, file);
  if (!force && (await exists(target))) {
    present++;
    return false;
  }
  try {
    const result = await fetchSource(source, target);
    downloaded++;
    console.log(`  + ${file}  (${megabytes(result.bytes)})`);
  } catch (error) {
    failures.push(`${file}  <-  ${source}\n      ${(error as Error).message}`);
    console.log(`  ! ${file}  FAILED`);
  }
  return true;
}

/** Runs the jobs one after another with a short pause, to be gentle with the websites the pictures come from. */
async function oneByOne(jobs: Array<() => Promise<boolean>>): Promise<void> {
  for (const job of jobs) {
    const usedTheNetwork = await job();
    if (usedTheNetwork) await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

const maps = await store.listMaps();
console.log(`Maps (${maps.length})`);
for (const map of maps) {
  if (map.image.source) await fetchOne(map.image.file, map.image.source);
  else if (!(await exists(mediaFile(store.mediaDir, map.image.file)))) {
    failures.push(`${map.image.file} is missing and the map file names no source to download it from.`);
  }
}

const wanted = new Map<string, string>();
const localOnlyMissing: string[] = [];
for (const summary of await store.listSagas()) {
  const bundle = await store.loadBundle(summary.id);
  for (const image of collectImages(bundle)) {
    if (!image.file) continue; // shown straight from its web address, nothing to store
    if (image.source) wanted.set(image.file, image.source);
    else if (!(await exists(mediaFile(store.mediaDir, image.file)))) localOnlyMissing.push(image.file);
  }
}
console.log(`Pictures (${wanted.size})`);
await oneByOne([...wanted].map(([file, source]) => () => fetchOne(file, source)));

if (withTiles) {
  console.log('Map tiles');
  for (const map of maps) {
    if (!force && (await tilesReady(store.mediaDir, map))) {
      console.log(`  = ${map.id}: tiles are already there`);
      continue;
    }
    try {
      console.log(`  ~ ${map.id}: cutting ${map.width} x ${map.height} pixels into tiles, this takes a minute or two ...`);
      const started = Date.now();
      const { tiles } = await buildTiles(store.mediaDir, map);
      console.log(`  + ${map.id}: ${tiles} tiles in ${Math.round((Date.now() - started) / 1000)} s`);
    } catch (error) {
      failures.push(`tiles for map "${map.id}": ${(error as Error).message}`);
      console.log(`  ! ${map.id}: FAILED`);
    }
  }
}

console.log(`\nDone: ${downloaded} downloaded, ${present} already present, ${failures.length} failed.`);
if (localOnlyMissing.length) {
  console.log(`\n${localOnlyMissing.length} picture(s) were uploaded by hand elsewhere and cannot be downloaded:`);
  for (const file of [...new Set(localOnlyMissing)]) console.log(`  - ${file}`);
  console.log('Copy them over with an export/import (see docs/GUIDE.md), or upload them again.');
}
if (failures.length) {
  console.log('\nFailed:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
