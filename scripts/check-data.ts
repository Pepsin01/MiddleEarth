/**
 * Checks every data file: is it valid JSON, are all fields valid, and do the
 * entries fit together (no event pointing at a missing place or character)?
 * Run it after editing files in data/ by hand:
 *
 *   npm run data:check
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../server/config.ts';
import { HttpError } from '../server/errors.ts';
import { Store } from '../server/store.ts';
import { collectImages } from '../shared/images.ts';
import { listEpisodes } from '../shared/timeline.ts';

const config = loadConfig();
const store = new Store(config.dataDir);
let problems = 0;

const maps = await store.listMaps();
console.log(`Maps: ${maps.map((map) => `${map.id} (${map.width} x ${map.height})`).join(', ') || 'none'}`);

const sagasDir = path.join(config.dataDir, 'sagas');
const sagaIds = fs.existsSync(sagasDir) ? fs.readdirSync(sagasDir).filter((name) => fs.statSync(path.join(sagasDir, name)).isDirectory()) : [];
if (sagaIds.length === 0) console.log('No sagas found in data/sagas.');

for (const sagaId of sagaIds) {
  try {
    const bundle = await store.loadBundle(sagaId);
    const episodes = listEpisodes(bundle.saga);
    console.log(`\n${bundle.saga.title}  (data/sagas/${sagaId})`);
    console.log(
      `  ${episodes.length} episodes, ${bundle.events.length} events, ${bundle.characters.length} characters, ` +
        `${bundle.places.length} places, ${bundle.overlays.length} overlays, ${collectImages(bundle).length} pictures`,
    );
    const empty = episodes.filter((episode) => !bundle.events.some((event) => event.episodeId === episode.id));
    if (empty.length) console.log(`  episodes without events yet: ${empty.map((episode) => episode.code).join(', ')}`);
    const noPicture = bundle.events.filter((event) => !event.image).length;
    if (noPicture) console.log(`  ${noPicture} event(s) have no picture of their own (the place's or a character's picture is shown instead)`);
    const noLink = bundle.events.filter((event) => !event.wikiUrl).length;
    if (noLink) console.log(`  ${noLink} event(s) have no wiki link`);
    for (const problem of bundle.problems) {
      console.log(`  ! ${problem}`);
      problems++;
    }
    if (bundle.problems.length === 0) console.log('  no problems found');
  } catch (error) {
    problems++;
    console.log(`\ndata/sagas/${sagaId} cannot be loaded: ${(error as Error).message}`);
    if (error instanceof HttpError) for (const detail of error.details ?? []) console.log(`  ! ${detail}`);
  }
}

if (problems) {
  console.log(`\n${problems} problem(s) found.`);
  process.exitCode = 1;
} else {
  console.log('\nAll data files are fine.');
}
