import { createHash, randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { admin, audit, requireAdmin } from '../auth';
import { getLiveVersion, getTenantForm } from '../services/forms';
import { exportCsv, listResponses, summarize } from '../services/reports';
import { HttpError, newId, parse, sha256 } from '../util';

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const FilterQuery = z.object({
  versionId: z.string().max(64).optional(),
  from: DateStr.optional(),
  to: DateStr.optional(),
});

/** Unambiguous characters only (no 0/O, 1/I/L) — typed by hand on a kiosk. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const normalizePairingCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Identify images by their magic bytes, never by the client-supplied name or MIME type. */
function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null; // SVG deliberately not accepted: it can carry scripts.
}

export async function adminDataRoutes(app: FastifyInstance) {
  const viewer = { preHandler: requireAdmin('viewer') };
  const editor = { preHandler: requireAdmin('editor') };

  // ---------- Responses ----------
  app.get('/api/admin/responses', viewer, async (req) => {
    const q = parse(
      FilterQuery.extend({
        cursor: z.string().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      }),
      req.query,
    );
    const form = await getTenantForm(app.db, admin(req).tenantId);
    return listResponses(app.db, form.id, q);
  });

  app.get('/api/admin/responses/summary', viewer, async (req) => {
    const q = parse(FilterQuery, req.query);
    const form = await getTenantForm(app.db, admin(req).tenantId);
    return summarize(app.db, form.id, q);
  });

  app.get('/api/admin/responses/export.csv', viewer, async (req, reply) => {
    const q = parse(FilterQuery, req.query);
    const ctx = admin(req);
    const form = await getTenantForm(app.db, ctx.tenantId);
    const csv = await exportCsv(app.db, form.id, q);
    await audit(app.db, ctx, 'responses.export', q);
    const date = new Date().toISOString().slice(0, 10);
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="feedback-${ctx.tenantSlug}-${date}.csv"`)
      .header('Cache-Control', 'no-store');
    return csv;
  });

  // ---------- Devices ----------
  app.get('/api/admin/devices', viewer, async (req) => {
    const ctx = admin(req);
    const form = await getTenantForm(app.db, ctx.tenantId);
    const live = await getLiveVersion(app.db, form.id);
    const { rows } = await app.db.query<{
      id: string;
      name: string;
      running_version_id: string | null;
      running_number: number | null;
      outbox_size: number;
      app_version: string | null;
      last_seen_at: Date | null;
      created_at: Date;
    }>(
      `select d.id, d.name, d.running_version_id, v.number as running_number, d.outbox_size, d.app_version, d.last_seen_at, d.created_at
         from device d left join form_version v on v.id = d.running_version_id
        where d.tenant_id = $1 and d.revoked_at is null
        order by d.created_at`,
      [ctx.tenantId],
    );
    return {
      liveVersion: live && { id: live.id, number: live.number },
      publicSlug: form.public_slug,
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        runningVersion: r.running_version_id ? { id: r.running_version_id, number: r.running_number } : null,
        outboxSize: r.outbox_size,
        appVersion: r.app_version,
        lastSeenAt: r.last_seen_at,
        createdAt: r.created_at,
      })),
    };
  });

  app.post(
    '/api/admin/devices/pairing-codes',
    { ...editor, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const body = parse(z.object({ name: z.string().trim().min(1).max(60) }), req.body);
      const ctx = admin(req);
      const form = await getTenantForm(app.db, ctx.tenantId);
      const raw = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await app.db.query(
        `insert into pairing_code (code_hash, tenant_id, form_id, device_name, expires_at, created_by) values ($1, $2, $3, $4, $5, $6)`,
        [sha256(raw), ctx.tenantId, form.id, body.name, expiresAt, ctx.userId],
      );
      await audit(app.db, ctx, 'device.pairing_code', { name: body.name });
      return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/admin/devices/:id', editor, async (req, reply) => {
    const ctx = admin(req);
    const { rows } = await app.db.query<{ id: string }>(
      'update device set revoked_at = now() where id = $1 and tenant_id = $2 and revoked_at is null returning id',
      [req.params.id, ctx.tenantId],
    );
    if (!rows[0]) throw new HttpError(404, 'device_not_found', 'Device not found');
    await audit(app.db, ctx, 'device.revoke', { deviceId: req.params.id });
    reply.code(204);
  });

  // ---------- Assets (logo) ----------
  app.post('/api/admin/assets/logo', editor, async (req) => {
    const ctx = admin(req);
    const file = await req.file({ limits: { fileSize: LOGO_MAX_BYTES, files: 1 } });
    if (!file) throw new HttpError(400, 'no_file', 'No file uploaded');
    let buf: Buffer;
    try {
      buf = await file.toBuffer();
    } catch {
      throw new HttpError(413, 'file_too_large', 'Logo must be 2 MB or smaller');
    }
    const kind = sniffImage(buf);
    if (!kind) throw new HttpError(415, 'unsupported_type', 'Logo must be a PNG, JPEG or WebP image');
    const hash = createHash('sha256').update(buf).digest('hex');
    // Content-addressed key: identical uploads dedupe and URLs can be cached forever.
    const key = `${hash.slice(0, 32)}.${kind.ext}`;
    await app.storage.put(key, buf);
    await app.db.query(
      'insert into asset (id, tenant_id, kind, storage_key, mime, size_bytes, sha256) values ($1, $2, $3, $4, $5, $6, $7)',
      [newId('as'), ctx.tenantId, 'logo', key, kind.mime, buf.length, hash],
    );
    await audit(app.db, ctx, 'asset.upload', { key, size: buf.length });
    return { url: `/api/assets/${key}` };
  });
}

/** Public: served to kiosks / phones / admin. Keys are content hashes, so caching is safe. */
export async function assetRoutes(app: FastifyInstance) {
  const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
  app.get<{ Params: { key: string } }>('/api/assets/:key', async (req, reply) => {
    const m = /^([a-f0-9]{32})\.(png|jpg|webp)$/.exec(req.params.key);
    if (!m) throw new HttpError(404, 'not_found', 'Not found');
    const data = await app.storage.get(req.params.key);
    if (!data) throw new HttpError(404, 'not_found', 'Not found');
    reply
      .header('Content-Type', MIME[m[2]!]!)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'");
    return data;
  });
}
