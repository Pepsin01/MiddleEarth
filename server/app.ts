import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Config } from './config.ts';

export function createApp(config: Config): express.Express {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // In production the same server also delivers the built web app.
  const indexHtml = path.join(config.distDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.distDir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|media\/|thumb\/).*/, (_req, res) => {
      res.sendFile(indexHtml);
    });
  }

  return app;
}
