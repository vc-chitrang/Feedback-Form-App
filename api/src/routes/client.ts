import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireDevice } from '../auth';
import { getLiveVersion, getReleasedVersion } from '../services/forms';
import { ingestSubmission } from '../services/submissions';
import { HttpError, newId, newSecret, parse, sha256 } from '../util';
import { normalizePairingCode } from './admin-data';

interface FormScope {
  tenantId: string;
  formId: string;
  tenantName: string;
}

async function sendLive(app: FastifyInstance, req: FastifyRequest, reply: FastifyReply, scope: FormScope) {
  const live = await getLiveVersion(app.db, scope.formId);
  const etag = `"${live?.id ?? 'none'}"`;
  reply.header('ETag', etag).header('Cache-Control', 'no-cache');
  // Kiosks poll this every minute; 304 keeps it nearly free.
  if (req.headers['if-none-match'] === etag) return reply.code(304).send();
  return { tenantName: scope.tenantName, live: live && { versionId: live.id, number: live.number } };
}

async function sendVersion(app: FastifyInstance, reply: FastifyReply, scope: FormScope, versionId: string) {
  const v = await getReleasedVersion(app.db, scope.formId, versionId);
  if (!v) throw new HttpError(404, 'version_not_found', 'Version not found');
  // Released versions never change, so they can be cached forever by id.
  reply.header('Cache-Control', 'private, max-age=31536000, immutable');
  return { id: v.id, number: v.number, doc: v.doc };
}

export async function clientRoutes(app: FastifyInstance) {
  // ---------- Kiosk device pairing ----------
  app.post('/api/client/pair', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(
      z.object({ code: z.string().min(4).max(20), appVersion: z.string().max(40).optional() }),
      req.body,
    );
    const codeHash = sha256(normalizePairingCode(body.code));
    return app.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ tenant_id: string; form_id: string; device_name: string; tenant_name: string }>(
        `update pairing_code p set used_at = now()
           from tenant t
          where p.code_hash = $1 and p.used_at is null and p.expires_at > now() and t.id = p.tenant_id
          returning p.tenant_id, p.form_id, p.device_name, t.name as tenant_name`,
        [codeHash],
      );
      const pc = rows[0];
      if (!pc) throw new HttpError(400, 'invalid_code', 'This code is invalid or has expired. Create a new one in the admin app.');
      const token = newSecret();
      const deviceId = newId('dev');
      await tx.query(
        `insert into device (id, tenant_id, form_id, name, token_hash, app_version, last_seen_at) values ($1, $2, $3, $4, $5, $6, now())`,
        [deviceId, pc.tenant_id, pc.form_id, pc.device_name, sha256(token), body.appVersion ?? null],
      );
      return { deviceToken: token, deviceId, deviceName: pc.device_name, tenantName: pc.tenant_name };
    });
  });

  // ---------- Kiosk (device token) ----------
  const deviceScope = async (req: FastifyRequest): Promise<FormScope> => {
    const d = req.device!;
    const { rows } = await app.db.query<{ name: string }>('select name from tenant where id = $1', [d.tenantId]);
    return { tenantId: d.tenantId, formId: d.formId, tenantName: rows[0]?.name ?? '' };
  };
  const device = { preHandler: requireDevice };

  app.get('/api/client/live', device, async (req, reply) => sendLive(app, req, reply, await deviceScope(req)));

  app.get<{ Params: { id: string } }>('/api/client/versions/:id', device, async (req, reply) =>
    sendVersion(app, reply, await deviceScope(req), req.params.id),
  );

  app.post('/api/client/submissions', { ...device, bodyLimit: 256 * 1024 }, async (req, reply) => {
    const d = req.device!;
    const r = await ingestSubmission(app.db, { tenantId: d.tenantId, formId: d.formId, deviceId: d.deviceId, channel: 'kiosk' }, req.body);
    reply.code(r.duplicate ? 200 : 201);
    return r;
  });

  app.post('/api/client/heartbeat', device, async (req) => {
    const d = req.device!;
    const body = parse(
      z.object({
        runningVersionId: z.string().max(64).nullable(),
        outboxSize: z.number().int().min(0).max(1_000_000),
        appVersion: z.string().max(40).optional(),
      }),
      req.body,
    );
    // Only record a version id that really belongs to this device's form.
    const running = body.runningVersionId ? await getReleasedVersion(app.db, d.formId, body.runningVersionId) : null;
    await app.db.query(
      'update device set running_version_id = $2, outbox_size = $3, app_version = coalesce($4, app_version), last_seen_at = now() where id = $1',
      [d.deviceId, running?.id ?? null, body.outboxSize, body.appVersion ?? null],
    );
    return { ok: true };
  });

  // ---------- Public QR / link (visitor's own phone) ----------
  const publicScope = async (slug: string): Promise<FormScope> => {
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) throw new HttpError(404, 'form_not_found', 'Form not found');
    const { rows } = await app.db.query<{ id: string; tenant_id: string; tenant_name: string }>(
      'select f.id, f.tenant_id, t.name as tenant_name from form f join tenant t on t.id = f.tenant_id where f.public_slug = $1',
      [slug],
    );
    if (!rows[0]) throw new HttpError(404, 'form_not_found', 'Form not found');
    return { tenantId: rows[0].tenant_id, formId: rows[0].id, tenantName: rows[0].tenant_name };
  };

  app.get<{ Params: { slug: string } }>('/api/public/:slug/live', async (req, reply) =>
    sendLive(app, req, reply, await publicScope(req.params.slug)),
  );

  app.get<{ Params: { slug: string; id: string } }>('/api/public/:slug/versions/:id', async (req, reply) =>
    sendVersion(app, reply, await publicScope(req.params.slug), req.params.id),
  );

  app.post<{ Params: { slug: string } }>(
    '/api/public/:slug/submissions',
    { bodyLimit: 256 * 1024, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const scope = await publicScope(req.params.slug);
      const durationMs = (req.body as { durationMs?: unknown } | null)?.durationMs;
      // Humans cannot answer a form in under 3 seconds; bots can.
      if (typeof durationMs === 'number' && durationMs < 3000) {
        throw new HttpError(422, 'too_fast', 'Please take a moment to answer the questions');
      }
      const r = await ingestSubmission(app.db, { tenantId: scope.tenantId, formId: scope.formId, deviceId: null, channel: 'public' }, req.body);
      reply.code(r.duplicate ? 200 : 201);
      return r;
    },
  );
}
