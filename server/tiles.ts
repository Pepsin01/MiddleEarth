/**
 * Cuts a large map picture into a pyramid of small square tiles, so the browser
 * only ever loads the part of the map that is on screen at the current zoom.
 *
 * Zoom level `maxZoom` holds the picture at full size; every level below halves it,
 * down to level 0 where the whole map fits into a single tile.
 * Tiles are stored as <tiles.path>/<zoom>/<row>/<column>.<ext>.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { MapDef } from '../shared/schema.ts';
import { exists, mediaFile } from './media.ts';

export function maxZoomFor(width: number, height: number, tileSize = 256): number {
  return Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / tileSize)));
}

export async function imageSize(file: string): Promise<{ width: number; height: number }> {
  const meta = await sharp(file, { limitInputPixels: false }).metadata();
  if (!meta.width || !meta.height) throw new Error(`Cannot read the size of ${file}`);
  // Photos can be stored rotated; orientations 5-8 swap width and height.
  const swapped = (meta.orientation ?? 1) >= 5;
  return swapped ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };
}

export async function tilesReady(mediaDir: string, map: MapDef): Promise<boolean> {
  const dir = mediaFile(mediaDir, map.tiles.path);
  return (await exists(path.join(dir, '0', '0', `0.${map.tiles.ext}`))) && (await exists(path.join(dir, String(map.tiles.maxZoom), '0', `0.${map.tiles.ext}`)));
}

export async function buildTiles(mediaDir: string, map: MapDef): Promise<{ tiles: number }> {
  const source = mediaFile(mediaDir, map.image.file);
  if (!(await exists(source))) throw new Error(`The map picture ${map.image.file} is missing. Run "npm run media:fetch" first.`);

  const size = await imageSize(source);
  if (size.width !== map.width || size.height !== map.height) {
    throw new Error(
      `The picture is ${size.width} x ${size.height} pixels, but data/maps/${map.id}.json says ${map.width} x ${map.height}. ` +
        'Positions in the data depend on this size - fix the numbers in the map file or use the right picture.',
    );
  }
  const expectedZoom = maxZoomFor(map.width, map.height, map.tiles.size);
  if (map.tiles.maxZoom !== expectedZoom) {
    throw new Error(`For this picture "tiles.maxZoom" must be ${expectedZoom} (data/maps/${map.id}.json says ${map.tiles.maxZoom}).`);
  }

  const target = mediaFile(mediaDir, map.tiles.path);
  const building = `${target}.building`;
  await fsp.rm(building, { recursive: true, force: true });
  await fsp.mkdir(path.dirname(target), { recursive: true });

  const background = map.background ?? '#ffffff';
  let image = sharp(source, { limitInputPixels: false, sequentialRead: true }).rotate().flatten({ background });
  if (map.tiles.ext === 'webp') image = image.webp({ quality: 82, smartSubsample: true });
  else if (map.tiles.ext === 'png') image = image.png();
  else image = image.jpeg({ quality: 85, chromaSubsampling: '4:4:4' });

  // "google" layout = <zoom>/<row>/<column>, every tile padded to full size, nothing skipped.
  await image.tile({ size: map.tiles.size, layout: 'google', background, skipBlanks: -1 }).toFile(building);

  let tiles = 0;
  for (const entry of await fsp.readdir(building, { recursive: true })) {
    if (entry.endsWith(`.${map.tiles.ext}`)) tiles++;
  }
  await fsp.rm(target, { recursive: true, force: true });
  await fsp.rename(building, target);
  return { tiles };
}
