import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';
import { formatJson } from '../server/json-format.ts';

describe('server basics', () => {
  it('answers the health check', async () => {
    const { app } = createApp(loadConfig({}));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('answers unknown API routes with a JSON 404', async () => {
    const { app } = createApp(loadConfig({}));
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  it('reads the admin password and flags from the environment', () => {
    const config = loadConfig({ ADMIN_PASSWORD: '  mellon  ', READ_ONLY: 'true', PORT: '9000' });
    expect(config.adminPassword).toBe('mellon');
    expect(config.readOnly).toBe(true);
    expect(config.port).toBe(9000);
    expect(loadConfig({}).adminPassword).toBeNull();
  });
});

describe('formatJson', () => {
  it('keeps points and short lists on one line', () => {
    const text = formatJson({
      id: 'e1',
      pos: [4521, 3310],
      characters: ['galadriel', 'elrond'],
      via: [
        [1, 2],
        [3, 4],
      ],
      image: { file: 'img/a.jpg', focus: [0.5, 0.2] },
      empty: [],
      skipped: undefined,
    });
    expect(text).toBe(
      [
        '{',
        '  "id": "e1",',
        '  "pos": [4521, 3310],',
        '  "characters": ["galadriel", "elrond"],',
        '  "via": [[1, 2], [3, 4]],',
        '  "image": {',
        '    "file": "img/a.jpg",',
        '    "focus": [0.5, 0.2]',
        '  },',
        '  "empty": []',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('breaks long lists over several lines and stays valid JSON', () => {
    const value = { names: Array.from({ length: 30 }, (_, i) => `character-number-${i}`) };
    const text = formatJson(value);
    expect(text.split('\n').length).toBeGreaterThan(30);
    expect(JSON.parse(text)).toEqual(value);
  });
});
