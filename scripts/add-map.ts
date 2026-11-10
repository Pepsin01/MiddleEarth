/**
 * Registers a new map picture (for example a Third Age map for the films).
 *
 *   npm run map:add -- --id third-age --title "Middle-earth in the Third Age" \
 *       --file "C:\Pictures\third-age.jpg" --credit "Map by ..." --url "https://where-it-came-from"
 *
 * The picture is copied into data/media/maps/<id>/, a description is written to
 * data/maps/<id>.json and the zoomable tiles are built. Afterwards create a saga
 * that uses the map (in the app: Edit > Sagas), or point an existing saga at it.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '../server/config.ts';
import { formatJson } from '../server/json-format.ts';
import { exists, mediaFile } from '../server/media.ts';
import { Store } from '../server/store.ts';
import { buildTiles, imageSize, maxZoomFor } from '../server/tiles.ts';
import { MapDef } from '../shared/schema.ts';

const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    title: { type: 'string' },
    file: { type: 'string' },
    credit: { type: 'string' },
    url: { type: 'string' },
    tint: { type: 'string' },
  },
});

if (!values.id || !values.title || !values.file || !values.credit) {
  console.error('Usage: npm run map:add -- --id <id> --title "<title>" --file <picture> --credit "<who made it>" [--url <source page>] [--tint "#efe6d0"]');
  process.exit(1);
}

const config = loadConfig();
const store = new Store(config.dataDir);
const description = path.join(config.dataDir, 'maps', `${values.id}.json`);
if (await exists(description)) {
  console.error(`data/maps/${values.id}.json already exists. Pick another id, or delete that file first.`);
  process.exit(1);
}

const extension = path.extname(values.file).toLowerCase().replace('.jpeg', '.jpg') || '.jpg';
const size = await imageSize(values.file);
const map = MapDef.parse({
  id: values.id,
  title: values.title,
  width: size.width,
  height: size.height,
  image: { file: `maps/${values.id}/source${extension}`, source: values.url },
  tiles: { path: `maps/${values.id}/tiles`, size: 256, maxZoom: maxZoomFor(size.width, size.height), ext: 'webp' },
  credit: values.credit,
  creditUrl: values.url,
  tint: values.tint,
});

const target = mediaFile(store.mediaDir, map.image.file);
await fsp.mkdir(path.dirname(target), { recursive: true });
await fsp.copyFile(values.file, target);
await fsp.mkdir(path.dirname(description), { recursive: true });
await fsp.writeFile(description, formatJson(map), 'utf8');
console.log(`Wrote data/maps/${map.id}.json (${map.width} x ${map.height} pixels). Cutting tiles ...`);
const { tiles } = await buildTiles(store.mediaDir, map);
console.log(`Done: ${tiles} tiles. The map "${map.id}" can now be used by a saga.`);
