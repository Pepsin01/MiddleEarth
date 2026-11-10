/**
 * (Re)builds the zoomable tiles of one map, or of all maps.
 *
 *   npm run map:tiles                  all maps
 *   npm run map:tiles -- second-age    just this one
 */
import { loadConfig } from '../server/config.ts';
import { Store } from '../server/store.ts';
import { buildTiles } from '../server/tiles.ts';

const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const store = new Store(loadConfig().dataDir);
const maps = (await store.listMaps()).filter((map) => only.length === 0 || only.includes(map.id));

if (maps.length === 0) {
  console.error(only.length ? `No map called ${only.join(', ')} in data/maps.` : 'There are no maps in data/maps.');
  process.exit(1);
}

for (const map of maps) {
  console.log(`${map.id}: cutting ${map.width} x ${map.height} pixels into tiles ...`);
  const started = Date.now();
  const { tiles } = await buildTiles(store.mediaDir, map);
  console.log(`${map.id}: ${tiles} tiles in ${Math.round((Date.now() - started) / 1000)} s`);
}
