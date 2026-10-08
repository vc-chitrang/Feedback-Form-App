import { SubmissionPayload, validateSubmission } from '@ff/form-schema';
import type { Db } from '../db';
import { HttpError, parse, utcDateISO } from '../util';
import { getReleasedVersion } from './forms';

export interface IngestContext {
  tenantId: string;
  formId: string;
  deviceId: string | null;
  channel: 'kiosk' | 'public';
}

/**
 * Store one submission.
 *  - validated against the EXACT version it was filled on (may be archived — offline kiosks
 *    and visitors who were mid-form during a publish must not lose their answers);
 *  - idempotent on the client-generated id, so retries and double taps never duplicate.
 */
export async function ingestSubmission(db: Db, ctx: IngestContext, body: unknown) {
  const p = parse(SubmissionPayload, body);
  const version = await getReleasedVersion(db, ctx.formId, p.versionId);
  if (!version) throw new HttpError(422, 'unknown_version', 'This form version does not exist');

  // ±1 day window so devices in other timezones are not rejected by "no future date" rules.
  const check = validateSubmission(version.doc, p.answers, { today: { earliest: utcDateISO(-1), latest: utcDateISO(1) } });
  if (!check.ok) throw new HttpError(422, 'invalid_answers', 'Some answers are invalid', { errors: check.errors });

  return db.transaction(async (tx) => {
    const inserted = await tx.query<{ id: string }>(
      `insert into submission (id, tenant_id, form_id, version_id, device_id, channel, locale, started_at, device_submitted_at, duration_ms)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (id) do nothing
       returning id`,
      [
        p.id,
        ctx.tenantId,
        ctx.formId,
        version.id,
        ctx.deviceId,
        ctx.channel,
        p.locale,
        p.startedAt ?? null,
        p.deviceSubmittedAt ?? null,
        p.durationMs ?? null,
      ],
    );
    if (!inserted.rows[0]) {
      const existing = await tx.query<{ form_id: string }>('select form_id from submission where id = $1', [p.id]);
      if (existing.rows[0]?.form_id !== ctx.formId) throw new HttpError(409, 'id_conflict', 'Submission id already used');
      return { id: p.id, duplicate: true };
    }

    const entries = Object.entries(check.values);
    if (entries.length) {
      const params: unknown[] = [p.id];
      const tuples = entries.map(([uid, value], i) => {
        params.push(uid, JSON.stringify(value));
        return `($1, $${i * 2 + 2}, $${i * 2 + 3}::jsonb)`;
      });
      await tx.query(`insert into answer (submission_id, question_uid, value) values ${tuples.join(', ')}`, params);
    }
    return { id: p.id, duplicate: false };
  });
}
