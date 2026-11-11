import fs from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';
import type { SagaBundle } from '../shared/schema.ts';
import { writeFixture } from './fixture.ts';

const EDIT = { 'x-chronicle': '1' };
const SAGA = '/api/sagas/test-saga';

let dataDir: string;

beforeEach(async () => {
  dataDir = await writeFixture();
});

afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

function server(env: Record<string, string> = {}) {
  return createApp(loadConfig({ DATA_DIR: dataDir, ...env })).app;
}

async function readData<T = unknown>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8')) as T;
}

const newEvent = { title: 'A New Dawn', episodeId: 's1e1', storylineId: 'elves', placeId: 'lindon', characters: ['galadriel'] };

describe('reading', () => {
  it('lists sagas with their size', async () => {
    const res = await request(server()).get('/api/sagas');
    expect(res.body).toEqual([{ id: 'test-saga', title: 'Test saga', mapId: 'test-map', episodes: 3, events: 5 }]);
  });

  it('returns everything about one saga', async () => {
    const res = await request(server()).get(SAGA);
    const bundle = res.body as SagaBundle;
    expect(res.status).toBe(200);
    expect(bundle.map.id).toBe('test-map');
    expect(bundle.events.map((event) => `${event.episodeId}/${event.id}`)).toEqual(['s1e1/e1', 's1e1/e2', 's1e2/e3', 's1e2/e4', 's2e1/e5']);
    expect(bundle.problems).toEqual([]);
  });

  it('answers 404 for unknown or malformed saga ids', async () => {
    expect((await request(server()).get('/api/sagas/nope')).status).toBe(404);
    expect((await request(server()).get('/api/sagas/..%2F..%2Fsecrets')).status).toBe(404);
  });

  it('skips a broken entry, reports it, and keeps it in the file when saving', async () => {
    const file = path.join(dataDir, 'sagas/test-saga/places.json');
    const places = JSON.parse(await fs.readFile(file, 'utf8')) as unknown[];
    places.push({ id: 'half-finished', name: 'Hand-edited, position missing' });
    await fs.writeFile(file, JSON.stringify(places));

    const app = server();
    const bundle = (await request(app).get(SAGA)).body as SagaBundle;
    expect(bundle.places.map((place) => place.id)).toEqual(['lindon', 'moria']);
    expect(bundle.problems.join('\n')).toContain('"half-finished" was skipped');

    const created = await request(app).post(`${SAGA}/places`).set(EDIT).send({ name: 'Eregion', pos: [300, 200] });
    expect(created.status).toBe(201);
    const saved = await readData<Array<{ id: string }>>('sagas/test-saga/places.json');
    expect(saved.map((place) => place.id)).toEqual(['lindon', 'moria', 'half-finished', 'eregion']);
  });

  it('refuses to overwrite a file that is not valid JSON', async () => {
    await fs.writeFile(path.join(dataDir, 'sagas/test-saga/places.json'), '[ { "id": "lindon", oops');
    const app = server();
    const bundle = (await request(app).get(SAGA)).body as SagaBundle;
    expect(bundle.problems.join('\n')).toContain('places.json could not be read');

    const res = await request(app).post(`${SAGA}/places`).set(EDIT).send({ name: 'Eregion', pos: [300, 200] });
    expect(res.status).toBe(409);
    expect(await fs.readFile(path.join(dataDir, 'sagas/test-saga/places.json'), 'utf8')).toContain('oops');
  });
});

describe('who may edit', () => {
  it('rejects changes that lack the edit header (cross-site request protection)', async () => {
    const res = await request(server()).post(`${SAGA}/events`).send(newEvent);
    expect(res.status).toBe(400);
  });

  it('lets everybody edit when no password is set', async () => {
    const app = server();
    expect((await request(app).get('/api/session')).body).toEqual({ readOnly: false, authRequired: false, authenticated: false, canEdit: true });
    expect((await request(app).post(`${SAGA}/events`).set(EDIT).send(newEvent)).status).toBe(201);
  });

  it('requires a login when a password is set', async () => {
    const app = server({ ADMIN_PASSWORD: 'mellon' });
    const agent = request.agent(app);

    expect((await agent.get('/api/session')).body.canEdit).toBe(false);
    expect((await agent.post(`${SAGA}/events`).set(EDIT).send(newEvent)).status).toBe(401);
    expect((await agent.post('/api/login').set(EDIT).send({ password: 'friend' })).status).toBe(401);

    const login = await agent.post('/api/login').set(EDIT).send({ password: 'mellon' });
    expect(login.status).toBe(200);
    expect(login.body.canEdit).toBe(true);
    expect(String(login.headers['set-cookie'])).toContain('HttpOnly');

    expect((await agent.get('/api/session')).body).toMatchObject({ authenticated: true, canEdit: true });
    expect((await agent.post(`${SAGA}/events`).set(EDIT).send(newEvent)).status).toBe(201);

    await agent.post('/api/logout').set(EDIT);
    expect((await agent.get('/api/session')).body.canEdit).toBe(false);
  });

  it('does not accept a forged or foreign session cookie', async () => {
    const app = server({ ADMIN_PASSWORD: 'mellon' });
    const other = request.agent(server({ ADMIN_PASSWORD: 'different' }));
    const login = await other.post('/api/login').set(EDIT).send({ password: 'different' });
    const cookie = String(login.headers['set-cookie']).split(';')[0];

    const res = await request(app).post(`${SAGA}/events`).set(EDIT).set('Cookie', cookie).send(newEvent);
    expect(res.status).toBe(401);
    const forged = await request(app).post(`${SAGA}/events`).set(EDIT).set('Cookie', `chronicle_session=${Date.now() + 100000}.abc`).send(newEvent);
    expect(forged.status).toBe(401);
  });

  it('locks out after too many wrong passwords', async () => {
    const app = server({ ADMIN_PASSWORD: 'mellon' });
    for (let i = 0; i < 8; i++) {
      expect((await request(app).post('/api/login').set(EDIT).send({ password: 'wrong' })).status).toBe(401);
    }
    const locked = await request(app).post('/api/login').set(EDIT).send({ password: 'mellon' });
    expect(locked.status).toBe(429);
  });

  it('blocks all edits in read-only mode, even with the password', async () => {
    const agent = request.agent(server({ ADMIN_PASSWORD: 'mellon', READ_ONLY: 'true' }));
    await agent.post('/api/login').set(EDIT).send({ password: 'mellon' });
    expect((await agent.post(`${SAGA}/events`).set(EDIT).send(newEvent)).status).toBe(403);
  });
});

describe('editing events', () => {
  it('creates an event with a readable id at the end of its episode', async () => {
    const res = await request(server()).post(`${SAGA}/events`).set(EDIT).send(newEvent);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('s1e1-a-new-dawn');
    const stored = await readData<Array<Record<string, unknown>>>('sagas/test-saga/events/s1e1.json');
    expect(stored.map((event) => event.id)).toEqual(['e1', 'e2', 's1e1-a-new-dawn']);
    expect(stored[2]).not.toHaveProperty('episodeId'); // the file name already says which episode
  });

  it('inserts at a requested position', async () => {
    await request(server()).post(`${SAGA}/events?position=0`).set(EDIT).send(newEvent);
    const stored = await readData<Array<{ id: string }>>('sagas/test-saga/events/s1e1.json');
    expect(stored.map((event) => event.id)).toEqual(['s1e1-a-new-dawn', 'e1', 'e2']);
  });

  it('explains what is wrong with invalid input', async () => {
    const res = await request(server())
      .post(`${SAGA}/events`)
      .set(EDIT)
      .send({ title: '', episodeId: 's1e1', storylineId: 'elves' });
    expect(res.status).toBe(400);
    expect(res.body.details.join('\n')).toContain('title');
    expect(res.body.details.join('\n')).toContain('needs a place or a position');
  });

  it('rejects references to things that do not exist', async () => {
    const res = await request(server())
      .post(`${SAGA}/events`)
      .set(EDIT)
      .send({ ...newEvent, characters: ['sauron'] });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(['Event "s1e1-a-new-dawn" lists the unknown character "sauron".']);
    expect((await request(server()).post(`${SAGA}/events`).set(EDIT).send({ ...newEvent, episodeId: 's9e9' })).status).toBe(400);
  });

  it('keeps the position when editing and moves the event when its episode changes', async () => {
    const app = server();
    const edited = await request(app)
      .put(`${SAGA}/events/e1`)
      .set(EDIT)
      .send({ ...newEvent, title: 'Renamed' });
    expect(edited.status).toBe(200);
    expect((await readData<Array<{ id: string; title: string }>>('sagas/test-saga/events/s1e1.json')).map((event) => event.title)).toEqual(['Renamed', 'Durin at home']);

    await request(app)
      .put(`${SAGA}/events/e1`)
      .set(EDIT)
      .send({ ...newEvent, title: 'Renamed', episodeId: 's2e1' });
    expect((await readData<Array<{ id: string }>>('sagas/test-saga/events/s1e1.json')).map((event) => event.id)).toEqual(['e2']);
    expect((await readData<Array<{ id: string }>>('sagas/test-saga/events/s2e1.json')).map((event) => event.id)).toEqual(['e5', 'e1']);
  });

  it('reorders the events of an episode', async () => {
    const app = server();
    const url = `${SAGA}/episodes/s1e1/order`;
    expect((await request(app).put(url).set(EDIT).send({ ids: ['e2'] })).status).toBe(400);
    expect((await request(app).put(url).set(EDIT).send({ ids: ['e2', 'e1'] })).status).toBe(200);
    expect((await readData<Array<{ id: string }>>('sagas/test-saga/events/s1e1.json')).map((event) => event.id)).toEqual(['e2', 'e1']);
  });

  it('deletes an event and unhooks overlays that were timed by it', async () => {
    const app = server();
    expect((await request(app).delete(`${SAGA}/events/e4`).set(EDIT)).status).toBe(200);
    expect((await request(app).delete(`${SAGA}/events/e4`).set(EDIT)).status).toBe(404);
    const overlays = await readData<Array<Record<string, unknown>>>('sagas/test-saga/overlays.json');
    expect(overlays[0]).not.toHaveProperty('untilEvent');
    expect(overlays[1]).not.toHaveProperty('fromEvent');
    expect(((await request(app).get(SAGA)).body as SagaBundle).problems).toEqual([]);
  });
});

describe('editing places and characters', () => {
  it('updates a place', async () => {
    const res = await request(server())
      .put(`${SAGA}/places/lindon`)
      .set(EDIT)
      .send({ name: 'Lindon', kind: 'realm', pos: [120, 90], wikiUrl: 'https://lotr.fandom.com/wiki/Lindon' });
    expect(res.status).toBe(200);
    expect((await readData<Array<{ pos: number[] }>>('sagas/test-saga/places.json'))[0].pos).toEqual([120, 90]);
  });

  it('stores a character with actor, credited picture and a suggested picture link', async () => {
    const app = server();
    const res = await request(app)
      .post(`${SAGA}/characters`)
      .set(EDIT)
      .send({
        name: 'Elrond',
        playedBy: 'Some Actor',
        image: { file: 'img/characters/elrond.jpg', credit: 'Photo: Someone, CC BY 3.0', page: 'https://commons.wikimedia.org/wiki/File:Example.jpg', focus: [0.5, 0.3] },
        suggestedPicture: 'https://lotr.fandom.com/wiki/File:Example.png',
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'elrond', playedBy: 'Some Actor', suggestedPicture: 'https://lotr.fandom.com/wiki/File:Example.png' });

    const bad = await request(app).post(`${SAGA}/characters`).set(EDIT).send({ name: 'Gil-galad', suggestedPicture: 'not a link' });
    expect(bad.status).toBe(400);
    const escaping = await request(app)
      .post(`${SAGA}/characters`)
      .set(EDIT)
      .send({ name: 'Gil-galad', image: { file: '../../secrets.txt' } });
    expect(escaping.status).toBe(400);
  });

  it('rejects a place outside the map and odd links', async () => {
    const app = server();
    expect((await request(app).post(`${SAGA}/places`).set(EDIT).send({ name: 'Valinor', pos: [-500, 100] })).status).toBe(400);
    const res = await request(app).post(`${SAGA}/places`).set(EDIT).send({ name: 'Valinor', pos: [5, 100], wikiUrl: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  it('only deletes a place in use when asked to, and events keep their spot', async () => {
    const app = server();
    const refused = await request(app).delete(`${SAGA}/places/moria`).set(EDIT);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toContain('used by 2 events');

    expect((await request(app).delete(`${SAGA}/places/moria?cascade=1`).set(EDIT)).status).toBe(200);
    const bundle = (await request(app).get(SAGA)).body as SagaBundle;
    expect(bundle.places.map((place) => place.id)).toEqual(['lindon']);
    expect(bundle.events.find((event) => event.id === 'e2')).toMatchObject({ pos: [500, 400] });
    expect(bundle.problems).toEqual([]);
  });

  it('takes a deleted character out of all events', async () => {
    const app = server();
    expect((await request(app).delete(`${SAGA}/characters/durin`).set(EDIT)).status).toBe(409);
    expect((await request(app).delete(`${SAGA}/characters/durin?cascade=1`).set(EDIT)).status).toBe(200);
    const bundle = (await request(app).get(SAGA)).body as SagaBundle;
    expect(bundle.events.find((event) => event.id === 'e4')).toMatchObject({ characters: ['galadriel'], exits: [] });
    expect(bundle.problems).toEqual([]);
  });
});

describe('editing the saga itself', () => {
  it('adds an episode with a generated id', async () => {
    const app = server();
    const { saga } = (await request(app).get(SAGA)).body as SagaBundle;
    saga.seasons[1].episodes.push({ title: 'Fourth' } as never);
    const res = await request(app).put(SAGA).set(EDIT).send(saga);
    expect(res.status).toBe(200);
    expect(res.body.seasons[1].episodes.map((episode: { id: string }) => episode.id)).toEqual(['s2e1', 's2e2']);
  });

  it('refuses to drop an episode or storyline that is still in use', async () => {
    const app = server();
    const { saga } = (await request(app).get(SAGA)).body as SagaBundle;
    const withoutEpisode = { ...saga, seasons: [saga.seasons[0]] };
    const first = await request(app).put(SAGA).set(EDIT).send(withoutEpisode);
    expect(first.status).toBe(409);
    expect(first.body.error).toContain('still has 1 event');

    const withoutStoryline = { ...saga, storylines: [saga.storylines[0]] };
    expect((await request(app).put(SAGA).set(EDIT).send(withoutStoryline)).status).toBe(409);
  });

  it('creates a new empty saga on an existing map', async () => {
    const app = server();
    const res = await request(app).post('/api/sagas').set(EDIT).send({ title: 'The Films', mapId: 'test-map' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('the-films');
    expect((await request(app).get('/api/sagas')).body).toHaveLength(2);
    expect((await request(app).post('/api/sagas').set(EDIT).send({ title: 'No map', mapId: 'nowhere' })).status).toBe(404);
  });
});

describe('pictures', () => {
  // the smallest valid PNG: one transparent pixel
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

  it('stores an uploaded picture and serves it, also shrunk', async () => {
    const app = server();
    const res = await request(app).post('/api/media/upload').set(EDIT).attach('file', png, 'My Still (1).png');
    expect(res.status).toBe(201);
    expect(res.body.file).toMatch(/^img\/uploads\/my-still-1-[0-9a-f]{8}\.png$/);
    expect((await request(app).get(`/media/${res.body.file}`)).status).toBe(200);
    const thumb = await request(app).get(`/thumb/96/${res.body.file}`);
    expect(thumb.status).toBe(200);
    expect(thumb.headers['content-type']).toBe('image/webp');
  });

  it('refuses files that are not pictures, and uploads without permission', async () => {
    const app = server();
    const notPicture = await request(app).post('/api/media/upload').set(EDIT).attach('file', Buffer.from('<script>alert(1)</script>'), 'evil.png');
    expect(notPicture.status).toBe(400);
    expect((await request(app).post('/api/media/upload').attach('file', png, 'a.png')).status).toBe(400);
    const locked = server({ ADMIN_PASSWORD: 'mellon' });
    expect((await request(locked).post('/api/media/upload').set(EDIT).attach('file', png, 'a.png')).status).toBe(401);
  });

  it('does not serve anything outside the media folder', async () => {
    const app = server();
    const escape = await request(app).get('/media/..%2Fsagas%2Ftest-saga%2Fsaga.json');
    expect([403, 404]).toContain(escape.status);
    expect(escape.text).not.toContain('Test saga');
    expect((await request(app).get('/thumb/96/..%2F..%2Fpackage.json')).status).toBe(400);
    expect((await request(app).get('/thumb/97/img/a.png')).status).toBe(400);
  });

  it('only accepts web addresses for fetching', async () => {
    const res = await request(server()).post('/api/media/fetch').set(EDIT).send({ url: 'file:///etc/passwd' });
    expect(res.status).toBe(400);
  });
});

describe('backups', () => {
  it('saves a snapshot before every change and can restore it', async () => {
    const app = server();
    expect((await request(app).get('/api/backups').set(EDIT)).body).toEqual([]);

    await request(app).delete(`${SAGA}/events/e1`).set(EDIT);
    const backups = (await request(app).get('/api/backups').set(EDIT)).body as Array<{ name: string; label: string }>;
    expect(backups).toHaveLength(1);
    expect(backups[0].label).toBe('delete-events');
    expect(((await request(app).get(SAGA)).body as SagaBundle).events).toHaveLength(4);

    expect((await request(app).post(`/api/backups/${backups[0].name}/restore`).set(EDIT)).status).toBe(200);
    expect(((await request(app).get(SAGA)).body as SagaBundle).events).toHaveLength(5);
    // restoring first backed up the state it replaced
    expect((await request(app).get('/api/backups').set(EDIT)).body).toHaveLength(2);
  });

  it('does not restore from made-up names', async () => {
    expect((await request(server()).post('/api/backups/..%2F..%2Fetc/restore').set(EDIT)).status).toBe(404);
  });

  it('exports everything as a zip that can be imported again', async () => {
    const app = server();
    const exported = await request(app).get('/api/export').set(EDIT).buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
    expect(exported.status).toBe(200);
    expect(exported.headers['content-type']).toBe('application/zip');
    const zip = exported.body as Buffer;

    await request(app).delete(`${SAGA}/events/e1`).set(EDIT);
    await request(app).delete(`${SAGA}/characters/stranger?cascade=1`).set(EDIT);
    const imported = await request(app).post('/api/import').set(EDIT).attach('file', zip, 'export.zip');
    expect(imported.status).toBe(200);
    expect(imported.body.dataFiles).toBeGreaterThan(5);
    const bundle = (await request(app).get(SAGA)).body as SagaBundle;
    expect(bundle.events).toHaveLength(5);
    expect(bundle.characters.map((character) => character.id)).toContain('stranger');
    expect(bundle.problems).toEqual([]);
  });

  it('refuses a zip with files that do not belong to an export', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const app = server();
    const evil = Buffer.from(zipSync({ '../outside.json': strToU8('{}'), 'sagas/test-saga/saga.json': strToU8('{}') }));
    const res = await request(app).post('/api/import').set(EDIT).attach('file', evil, 'evil.zip');
    expect(res.status).toBe(400);
    const script = Buffer.from(zipSync({ 'media/img/run.js': strToU8('alert(1)') }));
    expect((await request(app).post('/api/import').set(EDIT).attach('file', script, 'script.zip')).status).toBe(400);
    const broken = Buffer.from(zipSync({ 'sagas/test-saga/places.json': strToU8('[ oops') }));
    expect((await request(app).post('/api/import').set(EDIT).attach('file', broken, 'broken.zip')).status).toBe(400);
    expect((await request(app).post('/api/import').set(EDIT).attach('file', Buffer.from('not a zip'), 'x.zip')).status).toBe(400);
    // nothing was changed by any of these
    expect(((await request(app).get(SAGA)).body as SagaBundle).places).toHaveLength(2);
  });

  it('keeps only the newest snapshots', async () => {
    const app = server({ MAX_BACKUPS: '3' });
    for (let i = 0; i < 6; i++) await request(app).post('/api/backups').set(EDIT);
    // 3 newest, plus one more kept as the "daily" copy of today
    expect((await request(app).get('/api/backups').set(EDIT)).body).toHaveLength(4);
  });
});
