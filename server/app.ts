import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createApi } from './api.ts';
import { Auth } from './auth.ts';
import type { Config } from './config.ts';
import { HttpError } from './errors.ts';
import { createMediaRoutes } from './media.ts';
import { Store } from './store.ts';

export interface App {
  app: express.Express;
  store: Store;
}

export function createApp(config: Config): App {
  const app = express();
  const store = new Store(config.dataDir, config.maxBackups);
  const auth = new Auth(config);

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use('/api', createApi(store, auth));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });
  app.use(createMediaRoutes(store.mediaDir));

  // In production the same server also delivers the built web app.
  const indexHtml = path.join(config.distDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.distDir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|media\/|thumb\/).*/, (_req, res) => {
      res.sendFile(indexHtml);
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message, details: error.details });
      return;
    }
    const { type, status } = (error ?? {}) as { type?: string; status?: number };
    // Refusals raised by Express itself (unknown file, forbidden path, ...) keep their status.
    if (typeof status === 'number' && status >= 400 && status < 500 && !type) {
      res.status(status).json({ error: status === 404 ? 'Not found.' : 'The request was refused.' });
      return;
    }
    if (type === 'entity.parse.failed') {
      res.status(400).json({ error: 'The request was not valid JSON.' });
      return;
    }
    if (type === 'entity.too.large' || (error as { code?: string } | null)?.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'The request is too large.' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Something went wrong on the server. See the server log for details.' });
  });

  return { app, store };
}
