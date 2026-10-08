import { createSampleDoc } from '@ff/form-schema';
import type { FastifyBaseLogger } from 'fastify';
import { hashPassword } from './auth';
import type { Db } from './db';
import { newId } from './util';

export interface BootstrapOptions {
  tenantName: string;
  tenantSlug: string;
  adminEmail?: string;
  adminPassword?: string;
}

/**
 * First run only: create the organisation, its owner account and a published sample form (v1)
 * so the kiosk has something to show immediately. Idempotent — does nothing if a tenant exists.
 */
export async function bootstrap(db: Db, opts: BootstrapOptions, log: FastifyBaseLogger) {
  const { rows } = await db.query<{ n: number }>('select count(*)::int as n from tenant');
  if (rows[0]!.n > 0) return;

  if (!opts.adminEmail || !opts.adminPassword || opts.adminPassword.length < 12) {
    log.warn('Skipping bootstrap: set ADMIN_EMAIL and ADMIN_PASSWORD (min 12 chars) in api/.env');
    return;
  }

  const passwordHash = await hashPassword(opts.adminPassword);
  await db.transaction(async (tx) => {
    const tenantId = newId('tn');
    const userId = newId('usr');
    const formId = newId('fm');
    const versionId = newId('fv');
    await tx.query('insert into tenant (id, slug, name) values ($1, $2, $3)', [tenantId, opts.tenantSlug, opts.tenantName]);
    await tx.query(
      `insert into admin_user (id, tenant_id, email, name, password_hash, role) values ($1, $2, $3, $4, $5, 'owner')`,
      [userId, tenantId, opts.adminEmail!.toLowerCase(), 'Administrator', passwordHash],
    );
    await tx.query('insert into form (id, tenant_id, name, public_slug) values ($1, $2, $3, $4)', [
      formId,
      tenantId,
      'Visitor feedback',
      opts.tenantSlug,
    ]);
    await tx.query(
      `insert into form_version (id, form_id, number, status, doc, created_by, published_at, published_by)
       values ($1, $2, 1, 'PUBLISHED', $3::jsonb, $4, now(), $4)`,
      [versionId, formId, JSON.stringify(createSampleDoc(opts.tenantName)), userId],
    );
    await tx.query('update form set live_version_id = $1 where id = $2', [versionId, formId]);
  });
  log.info({ tenant: opts.tenantSlug, admin: opts.adminEmail }, 'Bootstrapped organisation with sample form v1');
}
