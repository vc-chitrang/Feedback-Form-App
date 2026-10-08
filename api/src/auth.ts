import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Queryable } from './db';
import { HttpError, newSecret, sha256 } from './util';

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );

// scrypt parameters (OWASP-recommended minimum: N=2^17 is ideal; 2^15 keeps login < 100 ms locally).
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt' || !n || !r || !p || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 128 * Number(n) * Number(r) * 2,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export type Role = 'owner' | 'editor' | 'viewer';
const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export interface AdminContext {
  userId: string;
  tenantId: string;
  role: Role;
  email: string;
  name: string;
  tenantName: string;
  tenantSlug: string;
}

export interface DeviceContext {
  deviceId: string;
  tenantId: string;
  formId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    admin: AdminContext | null;
    device: DeviceContext | null;
  }
}

export const SESSION_COOKIE = 'ff_sid';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export async function createSession(db: Queryable, userId: string): Promise<string> {
  const token = newSecret();
  await db.query('delete from admin_session where expires_at < now()');
  await db.query('insert into admin_session (token_hash, user_id, expires_at) values ($1, $2, $3)', [
    sha256(token),
    userId,
    new Date(Date.now() + SESSION_TTL_MS),
  ]);
  return token;
}

/** preHandler factory: requires a valid admin session with at least `minRole`. */
export function requireAdmin(minRole: Role = 'viewer') {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) throw new HttpError(401, 'unauthenticated', 'Please sign in');
    const { rows } = await req.server.db.query<{
      user_id: string;
      tenant_id: string;
      role: Role;
      email: string;
      name: string;
      tenant_name: string;
      tenant_slug: string;
    }>(
      `select u.id as user_id, u.tenant_id, u.role, u.email, u.name, t.name as tenant_name, t.slug as tenant_slug
         from admin_session s
         join admin_user u on u.id = s.user_id
         join tenant t on t.id = u.tenant_id
        where s.token_hash = $1 and s.expires_at > now() and u.disabled_at is null`,
      [sha256(token)],
    );
    const row = rows[0];
    if (!row) throw new HttpError(401, 'unauthenticated', 'Your session has expired. Please sign in again.');
    if (ROLE_RANK[row.role] < ROLE_RANK[minRole]) {
      throw new HttpError(403, 'forbidden', 'You do not have permission to do this');
    }
    req.admin = {
      userId: row.user_id,
      tenantId: row.tenant_id,
      role: row.role,
      email: row.email,
      name: row.name,
      tenantName: row.tenant_name,
      tenantSlug: row.tenant_slug,
    };
  };
}

/** preHandler: kiosk devices authenticate with `Authorization: Bearer <device token>`. */
export async function requireDevice(req: FastifyRequest) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'device_unpaired', 'This device is not paired');
  const { rows } = await req.server.db.query<{ id: string; tenant_id: string; form_id: string }>(
    'select id, tenant_id, form_id from device where token_hash = $1 and revoked_at is null',
    [sha256(token)],
  );
  const row = rows[0];
  if (!row) throw new HttpError(401, 'device_unpaired', 'This device is not paired or was removed');
  req.device = { deviceId: row.id, tenantId: row.tenant_id, formId: row.form_id };
}

export function admin(req: FastifyRequest): AdminContext {
  if (!req.admin) throw new HttpError(401, 'unauthenticated', 'Please sign in');
  return req.admin;
}

export async function audit(db: Queryable, ctx: AdminContext, action: string, details: unknown = {}) {
  await db.query('insert into audit_log (tenant_id, user_id, action, details) values ($1, $2, $3, $4::jsonb)', [
    ctx.tenantId,
    ctx.userId,
    action,
    JSON.stringify(details),
  ]);
}
