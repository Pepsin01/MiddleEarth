import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';

describe('server', () => {
  it('answers the health check', async () => {
    const app = createApp(loadConfig({}));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('reads the admin password and flags from the environment', () => {
    const config = loadConfig({ ADMIN_PASSWORD: '  mellon  ', READ_ONLY: 'true', PORT: '9000' });
    expect(config.adminPassword).toBe('mellon');
    expect(config.readOnly).toBe(true);
    expect(config.port).toBe(9000);
    expect(loadConfig({}).adminPassword).toBeNull();
  });
});
