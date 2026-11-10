import express from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import type { CollectionName } from '../shared/schema.ts';
import { EDIT_HEADER } from './auth.ts';
import type { Auth } from './auth.ts';
import { HttpError, parseOrThrow } from './errors.ts';
import type { Store } from './store.ts';

const LISTS = ['places', 'characters', 'overlays'] as const;

function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || !value) throw new HttpError(400, `Missing "${name}".`);
  return value;
}

function position(req: Request): number | undefined {
  const value = req.query.position;
  if (typeof value !== 'string' || value === '') return undefined;
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0) throw new HttpError(400, '"position" must be a whole number.');
  return index;
}

export function createApi(store: Store, auth: Auth): express.Router {
  const api = express.Router();
  const edit = auth.requireEdit;

  api.use(express.json({ limit: '2mb' }));
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  api.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  /* ------------------------------------------------------------- session */

  api.get('/session', (req, res) => {
    res.json(auth.session(req));
  });

  api.post('/login', (req, res) => {
    if (!req.get(EDIT_HEADER)) throw new HttpError(400, `Missing the "${EDIT_HEADER}" request header.`);
    auth.login(req, res, (req.body as { password?: unknown } | undefined)?.password);
    // The cookie was only just set, so describe the session as it will be from the next request on.
    const session = auth.session(req);
    res.json({ ...session, authenticated: true, canEdit: !session.readOnly });
  });

  api.post('/logout', (_req, res) => {
    auth.logout(res);
    res.json({ ok: true });
  });

  /* ------------------------------------------------------------- reading */

  api.get('/maps', async (_req, res) => {
    res.json(await store.listMaps());
  });

  api.get('/sagas', async (_req, res) => {
    res.json(await store.listSagas());
  });

  api.get('/sagas/:sagaId', async (req, res) => {
    res.json(await store.loadBundle(param(req, 'sagaId')));
  });

  /* ------------------------------------------------------------- editing */

  api.post('/sagas', edit, async (req, res) => {
    res.status(201).json(await store.createSaga(req.body));
  });

  api.put('/sagas/:sagaId', edit, async (req, res) => {
    res.json(await store.saveSaga(param(req, 'sagaId'), req.body));
  });

  for (const collection of LISTS) {
    api.post(`/sagas/:sagaId/${collection}`, edit, async (req, res) => {
      res.status(201).json(await store.saveItem(param(req, 'sagaId'), collection, req.body, 'create'));
    });
    api.put(`/sagas/:sagaId/${collection}/:id`, edit, async (req, res) => {
      res.json(await store.saveItem(param(req, 'sagaId'), collection, req.body, 'update', param(req, 'id')));
    });
  }

  api.post('/sagas/:sagaId/events', edit, async (req, res) => {
    res.status(201).json(await store.saveEvent(param(req, 'sagaId'), req.body, 'create', undefined, position(req)));
  });

  api.put('/sagas/:sagaId/events/:id', edit, async (req, res) => {
    res.json(await store.saveEvent(param(req, 'sagaId'), req.body, 'update', param(req, 'id'), position(req)));
  });

  api.put('/sagas/:sagaId/episodes/:episodeId/order', edit, async (req, res) => {
    const { ids } = parseOrThrow(z.object({ ids: z.array(z.string()) }), req.body);
    await store.reorderEvents(param(req, 'sagaId'), param(req, 'episodeId'), ids);
    res.json({ ok: true });
  });

  api.delete('/sagas/:sagaId/:collection/:id', edit, async (req, res) => {
    const collection = param(req, 'collection');
    if (!['places', 'characters', 'overlays', 'events'].includes(collection)) throw new HttpError(404, 'Not found.');
    await store.removeItem(param(req, 'sagaId'), collection as CollectionName, param(req, 'id'), req.query.cascade === '1');
    res.json({ ok: true });
  });

  /* ------------------------------------------------------------- backups */

  api.get('/backups', edit, async (_req, res) => {
    res.json(await store.listBackups());
  });

  api.post('/backups', edit, async (_req, res) => {
    res.status(201).json({ name: await store.snapshot('manual') });
  });

  api.post('/backups/:name/restore', edit, async (req, res) => {
    await store.restoreBackup(param(req, 'name'));
    res.json({ ok: true });
  });

  return api;
}
