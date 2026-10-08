import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createQuestion, uuidv4, type FormDoc, type Question } from '@ff/form-schema';
import { buildApp } from '../src/app';
import { bootstrap } from '../src/bootstrap';
import { openDb, openPostgres, type Db } from '../src/db';
import { MemoryStorage } from '../src/storage';

// Test-only credentials for an in-memory database.
const EMAIL = 'owner@test.local';
const PASSWORD = 'test-password-123456';

let app: FastifyInstance;
let db: Db;
let cookie: string;
let deviceToken: string;

async function adminReq(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
  return app.inject({ method, url, payload: payload as object, headers: { cookie } });
}

async function kioskReq(method: 'GET' | 'POST', url: string, payload?: unknown) {
  return app.inject({ method, url, payload: payload as object, headers: { authorization: `Bearer ${deviceToken}` } });
}

function answerFor(q: Question): unknown {
  switch (q.type) {
    case 'rating':
      return 4;
    case 'single_choice':
      return { optionUid: q.options[0]!.uid };
    case 'yes_no':
      return true;
    default:
      return undefined;
  }
}

function submissionFor(versionId: string, doc: FormDoc, id = uuidv4()) {
  const answers = doc.questions
    .filter((q) => q.required || q.type === 'rating')
    .map((q) => ({ questionUid: q.uid, value: answerFor(q) }))
    .filter((a) => a.value !== undefined);
  return { id, versionId, locale: 'en', durationMs: 20_000, answers };
}

beforeAll(async () => {
  // TEST_DATABASE_URL → run the same suite through the real Postgres driver (Supabase path).
  db = process.env.TEST_DATABASE_URL ? await openPostgres(process.env.TEST_DATABASE_URL, { max: 1 }) : await openDb(); // in-memory
  app = await buildApp({ db, storage: new MemoryStorage(), config: { cookieSecure: false, adminOrigins: [], corsOrigins: [] } });
  await bootstrap(db, { tenantName: 'Test Museum', tenantSlug: 'test-museum', adminEmail: EMAIL, adminPassword: PASSWORD }, app.log);

  const login = await app.inject({ method: 'POST', url: '/api/admin/auth/login', payload: { email: EMAIL, password: PASSWORD } });
  expect(login.statusCode).toBe(200);
  cookie = String(login.headers['set-cookie']).split(';')[0]!;

  const code = await adminReq('POST', '/api/admin/devices/pairing-codes', { name: 'Exit kiosk' });
  const pair = await app.inject({ method: 'POST', url: '/api/client/pair', payload: { code: code.json().code } });
  expect(pair.statusCode).toBe(200);
  deviceToken = pair.json().deviceToken;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('auth', () => {
  it('rejects wrong password and anonymous access', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/admin/auth/login', payload: { email: EMAIL, password: 'nope-nope-nope' } });
    expect(bad.statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/admin/form' })).statusCode).toBe(401);
  });

  it('pairing code is single-use', async () => {
    const code = await adminReq('POST', '/api/admin/devices/pairing-codes', { name: 'Once' });
    const first = await app.inject({ method: 'POST', url: '/api/client/pair', payload: { code: code.json().code } });
    const second = await app.inject({ method: 'POST', url: '/api/client/pair', payload: { code: code.json().code } });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(400);
  });
});

describe('edit form after collecting feedback (delete n, add m, reorder)', () => {
  let v1: { versionId: string; doc: FormDoc };
  const v1SubmissionIds: string[] = [];

  it('kiosk collects feedback on v1', async () => {
    const live = (await kioskReq('GET', '/api/client/live')).json();
    const version = (await kioskReq('GET', `/api/client/versions/${live.live.versionId}`)).json();
    v1 = { versionId: version.id, doc: version.doc };
    for (let i = 0; i < 5; i++) {
      const sub = submissionFor(v1.versionId, v1.doc);
      const res = await kioskReq('POST', '/api/client/submissions', sub);
      expect(res.statusCode).toBe(201);
      v1SubmissionIds.push(sub.id);
    }
  });

  it('duplicate submit (retry / double tap) stores one row', async () => {
    const sub = submissionFor(v1.versionId, v1.doc);
    expect((await kioskReq('POST', '/api/client/submissions', sub)).statusCode).toBe(201);
    expect((await kioskReq('POST', '/api/client/submissions', sub)).statusCode).toBe(200);
    v1SubmissionIds.push(sub.id);
  });

  it('rejects tampered payloads', async () => {
    const base = submissionFor(v1.versionId, v1.doc);
    const unknownQ = { ...base, id: uuidv4(), answers: [...base.answers, { questionUid: 'q_hacker01', value: 'x' }] };
    expect((await kioskReq('POST', '/api/client/submissions', unknownQ)).statusCode).toBe(422);
    const badVersion = { ...base, id: uuidv4(), versionId: 'fv_doesnotexist' };
    expect((await kioskReq('POST', '/api/client/submissions', badVersion)).statusCode).toBe(422);
    const badRating = {
      ...base,
      id: uuidv4(),
      answers: base.answers.map((a) => (typeof a.value === 'number' ? { ...a, value: 99 } : a)),
    };
    expect((await kioskReq('POST', '/api/client/submissions', badRating)).statusCode).toBe(422);
  });

  let v2: { versionId: string; doc: FormDoc };

  it('admin deletes 2, adds 2, reorders, publishes v2', async () => {
    const draft = (await adminReq('POST', '/api/admin/form/draft')).json();
    const doc: FormDoc = draft.doc;
    const removed = doc.questions.splice(2, 2); // delete n = 2
    const yes = { ...createQuestion('yes_no'), label: { en: 'First visit?' }, required: true };
    const rating = { ...createQuestion('rating'), label: { en: 'Rate the café' } };
    doc.questions.push(yes, rating); // add m = 2
    doc.questions.reverse(); // reorder

    const saved = await adminReq('PUT', '/api/admin/form/draft', { revision: draft.revision, doc });
    expect(saved.statusCode).toBe(200);

    const check = (await adminReq('GET', '/api/admin/form/draft/check')).json();
    expect(check.diff.removed).toEqual(removed.map((q) => q.uid));
    expect([...check.diff.added].sort()).toEqual([yes.uid, rating.uid].sort());
    expect(check.diff.reordered).toBe(true);

    const pub = await adminReq('POST', '/api/admin/form/publish', { revision: saved.json().revision });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().number).toBe(2);

    const live = (await kioskReq('GET', '/api/client/live')).json();
    const version = (await kioskReq('GET', `/api/client/versions/${live.live.versionId}`)).json();
    v2 = { versionId: version.id, doc: version.doc };
    expect(v2.versionId).not.toBe(v1.versionId);
  });

  it('old submissions are untouched and still render with v1 labels', async () => {
    const versions = (await adminReq('GET', '/api/admin/form/versions')).json().items;
    const old = versions.find((v: { id: string }) => v.id === v1.versionId);
    expect(old.status).toBe('ARCHIVED');
    expect(old.submissions).toBe(v1SubmissionIds.length);

    const list = (await adminReq('GET', `/api/admin/responses?versionId=${v1.versionId}&limit=100`)).json();
    expect(list.items.map((i: { id: string }) => i.id).sort()).toEqual([...v1SubmissionIds].sort());
    expect(list.items[0].versionNumber).toBe(1);
  });

  it('a visitor who was mid-form on v1 can still submit after publish (and offline kiosks later)', async () => {
    const res = await kioskReq('POST', '/api/client/submissions', submissionFor(v1.versionId, v1.doc));
    expect(res.statusCode).toBe(201);
  });

  it('published versions cannot be modified or deleted, even directly in SQL', async () => {
    await expect(db.query(`update form_version set doc = '{}'::jsonb where id = $1`, [v1.versionId])).rejects.toThrow(/immutable/);
    await expect(db.query('delete from form_version where id = $1', [v1.versionId])).rejects.toThrow();
  });

  it('CSV export has columns for removed questions marked [removed]', async () => {
    const res = await adminReq('GET', '/api/admin/responses/export.csv');
    expect(res.statusCode).toBe(200);
    const header = res.body.split('\r\n')[0]!;
    expect(header).toContain('[removed]');
    expect(header).toContain('First visit?');
  });

  it('rollback to v1 makes it live again without copying data', async () => {
    const rb = await adminReq('POST', '/api/admin/form/rollback', { versionId: v1.versionId });
    expect(rb.statusCode).toBe(200);
    const live = (await kioskReq('GET', '/api/client/live')).json();
    expect(live.live.versionId).toBe(v1.versionId);
    // and back again
    await adminReq('POST', '/api/admin/form/rollback', { versionId: v2.versionId });
  });
});

describe('draft safety', () => {
  it('concurrent edits: stale revision gets 409', async () => {
    const draft = (await adminReq('POST', '/api/admin/form/draft')).json();
    const first = await adminReq('PUT', '/api/admin/form/draft', { revision: draft.revision, doc: draft.doc });
    expect(first.statusCode).toBe(200);
    const stale = await adminReq('PUT', '/api/admin/form/draft', { revision: draft.revision, doc: draft.doc });
    expect(stale.statusCode).toBe(409);
  });

  it('publish is blocked for invalid drafts', async () => {
    const draft = (await adminReq('POST', '/api/admin/form/draft')).json();
    const doc: FormDoc = draft.doc;
    doc.questions = [{ ...createQuestion('single_choice'), label: { en: '' } }];
    const saved = (await adminReq('PUT', '/api/admin/form/draft', { revision: draft.revision, doc })).json();
    const pub = await adminReq('POST', '/api/admin/form/publish', { revision: saved.revision });
    expect(pub.statusCode).toBe(422);
    expect(pub.json().error.details.issues.length).toBeGreaterThan(0);
  });

  it('changing the type of an existing question is blocked', async () => {
    const state = (await adminReq('GET', '/api/admin/form')).json();
    const draft = state.draft;
    const doc: FormDoc = JSON.parse(JSON.stringify(state.live.doc));
    const target = doc.questions.find((q) => q.type === 'rating')!;
    doc.questions = doc.questions.map((q) => (q.uid === target.uid ? { ...createQuestion('short_text'), uid: target.uid, label: { en: 'x' } } : q));
    const saved = (await adminReq('PUT', '/api/admin/form/draft', { revision: draft.revision, doc })).json();
    const pub = await adminReq('POST', '/api/admin/form/publish', { revision: saved.revision });
    expect(pub.statusCode).toBe(422);
    await adminReq('DELETE', '/api/admin/form/draft');
  });

  it('rejects a malformed document', async () => {
    const draft = (await adminReq('POST', '/api/admin/form/draft')).json();
    const res = await adminReq('PUT', '/api/admin/form/draft', { revision: draft.revision, doc: { hello: 'world' } });
    expect(res.statusCode).toBe(400);
    await adminReq('DELETE', '/api/admin/form/draft');
  });
});

describe('devices & public link', () => {
  it('revoked device can no longer submit', async () => {
    const code = await adminReq('POST', '/api/admin/devices/pairing-codes', { name: 'Temp' });
    const pair = (await app.inject({ method: 'POST', url: '/api/client/pair', payload: { code: code.json().code } })).json();
    const del = await adminReq('DELETE', `/api/admin/devices/${pair.deviceId}`);
    expect(del.statusCode).toBe(204);
    const res = await app.inject({ method: 'GET', url: '/api/client/live', headers: { authorization: `Bearer ${pair.deviceToken}` } });
    expect(res.statusCode).toBe(401);
  });

  it('public link accepts submissions and rejects bots that answer too fast', async () => {
    const live = (await app.inject({ method: 'GET', url: '/api/public/test-museum/live' })).json();
    const version = (await app.inject({ method: 'GET', url: `/api/public/test-museum/versions/${live.live.versionId}` })).json();
    const sub = submissionFor(version.id, version.doc);
    const fast = await app.inject({ method: 'POST', url: '/api/public/test-museum/submissions', payload: { ...sub, durationMs: 500 } });
    expect(fast.statusCode).toBe(422);
    const ok = await app.inject({ method: 'POST', url: '/api/public/test-museum/submissions', payload: sub });
    expect(ok.statusCode).toBe(201);
  });

  it('ETag avoids re-downloading when nothing changed', async () => {
    const first = await kioskReq('GET', '/api/client/live');
    const again = await app.inject({
      method: 'GET',
      url: '/api/client/live',
      headers: { authorization: `Bearer ${deviceToken}`, 'if-none-match': String(first.headers.etag) },
    });
    expect(again.statusCode).toBe(304);
  });
});

describe('logo upload', () => {
  it('accepts PNG by magic bytes and rejects SVG', async () => {
    const boundary = '----fftest';
    const body = (name: string, type: string, data: Buffer) =>
      Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`),
        data,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
    const headers = { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` };
    const ok = await app.inject({ method: 'POST', url: '/api/admin/assets/logo', headers, payload: body('logo.png', 'image/png', png) });
    expect(ok.statusCode).toBe(200);
    const url = ok.json().url as string;
    const get = await app.inject({ method: 'GET', url });
    expect(get.statusCode).toBe(200);
    expect(get.headers['content-type']).toBe('image/png');

    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const bad = await app.inject({ method: 'POST', url: '/api/admin/assets/logo', headers, payload: body('x.png', 'image/png', svg) });
    expect(bad.statusCode).toBe(415);
  });
});
