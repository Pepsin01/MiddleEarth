/**
 * Pictures live in data/media, which is not committed to git:
 *
 *   data/media/maps/<mapId>/source.jpg     the original map picture
 *   data/media/maps/<mapId>/tiles/z/y/x    the map cut into zoomable tiles
 *   data/media/img/...                     pictures of characters, places and events
 *   data/media/.thumbs/<width>/...         automatically shrunk copies (safe to delete)
 *
 * This file knows how to download pictures, where they are stored, and how to
 * serve them (including shrunk versions so the browser never loads a huge file
 * for a thumbnail).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import express from 'express';
import sharp from 'sharp';
import { slugify } from '../shared/ids.ts';
import { MediaPath } from '../shared/schema.ts';
import { HttpError } from './errors.ts';

/** Sent with every download. Deliberately generic: it says nothing about you or this installation. */
export const USER_AGENT = 'Mozilla/5.0 (compatible; StoryMapMediaFetcher/1.0)';

export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export const THUMB_WIDTHS = [96, 192, 480, 960, 1600];

/** Turns a media path from the data ("img/characters/x.jpg") into a file path, refusing anything that escapes the media folder. */
export function mediaFile(mediaDir: string, relative: string): string {
  if (!MediaPath.safeParse(relative).success) throw new HttpError(400, 'Not a valid media path.');
  const file = path.resolve(mediaDir, relative);
  if (!file.startsWith(path.resolve(mediaDir) + path.sep)) throw new HttpError(400, 'Not a valid media path.');
  return file;
}

export async function exists(file: string): Promise<boolean> {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Some sources are web pages rather than picture files. This finds the actual
 * picture address(es) to try, best first.
 */
export async function resolveSource(source: string): Promise<string[]> {
  const url = new URL(source);
  if (/(^|\.)deviantart\.com$/.test(url.hostname) && url.pathname.includes('/art/')) {
    const res = await fetch(`https://backend.deviantart.com/oembed?format=json&url=${encodeURIComponent(source)}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) throw new Error(`DeviantArt did not describe ${source} (HTTP ${res.status})`);
    const preview = ((await res.json()) as { url?: string }).url;
    if (!preview) throw new Error(`DeviantArt gave no picture for ${source}`);
    // The preview address contains a resize instruction; without it we get the full-size original (when the artist allows it).
    const original = preview.replace(/\/v1\/[^?]*(?=\?token=)/, '');
    return original === preview ? [preview] : [original, preview];
  }
  return [source];
}

export interface DownloadResult {
  bytes: number;
  contentType: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Asks for a picture. When the website says "too many requests, come back later",
 * we wait as long as it asks (up to a minute) and try again, a few times.
 * A plain refusal (for example 403: this site does not want automated downloads)
 * is accepted as an answer and not worked around.
 */
async function politeFetch(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*;q=0.5' }, redirect: 'follow' });
    if (res.status !== 429 && res.status !== 503) return res;
    const asked = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(asked) && asked > 0 ? asked : 10;
    await res.body?.cancel();
    // A short pause we simply sit out. A long one means "stop for now": say so instead of knocking again.
    if (wait > 30 || attempt >= 2) {
      const minutes = Math.ceil(wait / 60);
      throw new Error(`${new URL(url).hostname} asks for a pause of about ${minutes} minute${minutes === 1 ? '' : 's'} (too many requests). Run the command again later; what is already downloaded is kept.`);
    }
    await sleep(wait * 1000 + 500);
  }
}

/** Downloads one picture to `file` (written atomically). Only http(s) picture responses up to `maxBytes` are accepted. */
export async function download(url: string, file: string, maxBytes = 200 * 1024 * 1024): Promise<DownloadResult> {
  const res = await politeFetch(url);
  if (res.status === 403) throw new Error(`The website refuses automated downloads of this picture (HTTP 403). Save it in your browser and upload it instead: ${url}`);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!contentType.startsWith('image/')) throw new Error(`Not a picture (${contentType || 'unknown type'}): ${url}`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new Error(`Too large (${Math.round(declared / 1e6)} MB): ${url}`);

  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.part`;
  let bytes = 0;
  const counter = async function* (source: AsyncIterable<Uint8Array>) {
    for await (const chunk of source) {
      bytes += chunk.length;
      if (bytes > maxBytes) throw new Error(`Too large (more than ${Math.round(maxBytes / 1e6)} MB): ${url}`);
      yield chunk;
    }
  };
  try {
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), counter, fs.createWriteStream(temporary));
    await fsp.rename(temporary, file);
  } catch (error) {
    await fsp.rm(temporary, { force: true });
    throw error;
  }
  return { bytes, contentType };
}

/** Downloads `source` to `file`, trying each candidate address in turn. */
export async function fetchSource(source: string, file: string, maxBytes?: number): Promise<DownloadResult> {
  let lastError: unknown;
  for (const url of await resolveSource(source)) {
    try {
      return await download(url, file, maxBytes);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`Nothing to download for ${source}`);
}

const STORED_FORMATS: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', avif: 'avif', heif: 'avif' };

/**
 * Stores a picture that was uploaded or pasted in the editor and returns its media path
 * ("img/uploads/<name>-<fingerprint>.<ext>"). Anything that is not a real picture is refused.
 */
export async function storeUpload(mediaDir: string, data: Buffer, originalName: string): Promise<string> {
  let format: string | undefined;
  try {
    format = (await sharp(data).metadata()).format;
  } catch {
    format = undefined;
  }
  const extension = format ? STORED_FORMATS[format] : undefined;
  if (!extension) throw new HttpError(400, 'This file is not a picture the app can use (JPEG, PNG, WebP, GIF or AVIF).');
  const base = slugify(path.basename(originalName).replace(/\.[^.]+$/, ''), 40);
  const fingerprint = crypto.createHash('sha1').update(data).digest('hex').slice(0, 8);
  const relative = `img/uploads/${base}-${fingerprint}.${extension}`;
  const target = mediaFile(mediaDir, relative);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, data);
  return relative;
}

/** Downloads a picture from a web address into the uploads folder. Fails with a readable message when the site refuses. */
export async function storeFromWeb(mediaDir: string, url: string): Promise<string> {
  const temporary = path.join(mediaDir, 'img', 'uploads', `.incoming-${crypto.randomBytes(6).toString('hex')}`);
  try {
    await fetchSource(url, temporary, 25 * 1024 * 1024);
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'picture');
    return await storeUpload(mediaDir, await fsp.readFile(temporary), name);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, `Could not get that picture: ${(error as Error).message}`);
  } finally {
    await fsp.rm(temporary, { force: true });
  }
}

/** Serves /media/... (the files as they are) and /thumb/<width>/... (shrunk copies, created on first use). */
export function createMediaRoutes(mediaDir: string): express.Router {
  const router = express.Router();

  router.use(
    '/media',
    express.static(mediaDir, {
      index: false,
      dotfiles: 'ignore',
      fallthrough: false,
      maxAge: '7d',
      setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );

  const building = new Map<string, Promise<void>>();

  router.get(/^\/thumb\/(\d+)\/(.+)$/, async (req, res) => {
    const width = Number(req.params[0]);
    const relative = decodeURIComponent(String(req.params[1]));
    if (!THUMB_WIDTHS.includes(width)) throw new HttpError(400, `Width must be one of ${THUMB_WIDTHS.join(', ')}.`);
    const original = mediaFile(mediaDir, relative);
    if (!(await exists(original))) throw new HttpError(404, 'No such picture.');

    const thumb = path.join(mediaDir, '.thumbs', String(width), `${relative}.webp`);
    const fresh = async () => {
      try {
        const [a, b] = await Promise.all([fsp.stat(thumb), fsp.stat(original)]);
        return a.mtimeMs >= b.mtimeMs;
      } catch {
        return false;
      }
    };
    if (!(await fresh())) {
      let job = building.get(thumb);
      if (!job) {
        job = (async () => {
          await fsp.mkdir(path.dirname(thumb), { recursive: true });
          const temporary = `${thumb}.${process.pid}.tmp`;
          await sharp(original, { animated: false })
            .rotate() // respect the camera orientation stored in photos
            .resize({ width, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(temporary);
          await fsp.rename(temporary, thumb);
        })().finally(() => building.delete(thumb));
        building.set(thumb, job);
      }
      await job;
    }
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type('image/webp').sendFile(thumb, { dotfiles: 'allow' });
  });

  return router;
}
