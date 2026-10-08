import {
  createDefaultDoc,
  diffDocs,
  FormDoc,
  validateForPublish,
  type QuestionType,
} from '@ff/form-schema';
import { audit, type AdminContext } from '../auth';
import type { Db, Queryable } from '../db';
import { HttpError, newId, parse } from '../util';

export interface FormRow {
  id: string;
  tenant_id: string;
  name: string;
  public_slug: string;
  live_version_id: string | null;
}

export interface VersionRow {
  id: string;
  form_id: string;
  number: number | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  doc: FormDoc;
  revision: number;
  based_on_version_id: string | null;
  updated_at: Date;
  published_at: Date | null;
}

const VERSION_COLS = 'id, form_id, number, status, doc, revision, based_on_version_id, updated_at, published_at';

/** MVP: one form per tenant (the schema already supports many). */
export async function getTenantForm(db: Queryable, tenantId: string): Promise<FormRow> {
  const { rows } = await db.query<FormRow>(
    'select id, tenant_id, name, public_slug, live_version_id from form where tenant_id = $1 order by created_at limit 1',
    [tenantId],
  );
  if (!rows[0]) throw new HttpError(404, 'form_not_found', 'No form exists for this organisation');
  return rows[0];
}

export async function getLiveVersion(db: Queryable, formId: string): Promise<VersionRow | null> {
  const { rows } = await db.query<VersionRow>(
    `select ${VERSION_COLS} from form_version where form_id = $1 and status = 'PUBLISHED'`,
    [formId],
  );
  return rows[0] ?? null;
}

export async function getDraft(db: Queryable, formId: string): Promise<VersionRow | null> {
  const { rows } = await db.query<VersionRow>(`select ${VERSION_COLS} from form_version where form_id = $1 and status = 'DRAFT'`, [
    formId,
  ]);
  return rows[0] ?? null;
}

/** A published or archived version (never a draft) that belongs to the form. */
export async function getReleasedVersion(db: Queryable, formId: string, versionId: string): Promise<VersionRow | null> {
  const { rows } = await db.query<VersionRow>(
    `select ${VERSION_COLS} from form_version where id = $1 and form_id = $2 and status <> 'DRAFT'`,
    [versionId, formId],
  );
  return rows[0] ?? null;
}

/** question uid → type, across every version that was ever published. */
export async function getKnownQuestionTypes(db: Queryable, formId: string): Promise<Record<string, QuestionType>> {
  const { rows } = await db.query<{ uid: string; type: QuestionType }>(
    `select distinct on (q->>'uid') q->>'uid' as uid, q->>'type' as type
       from form_version v, jsonb_array_elements(v.doc->'questions') q
      where v.form_id = $1 and v.status <> 'DRAFT'
      order by q->>'uid', v.number desc`,
    [formId],
  );
  return Object.fromEntries(rows.map((r) => [r.uid, r.type]));
}

export async function getAnswerCounts(db: Queryable, formId: string): Promise<Record<string, number>> {
  const { rows } = await db.query<{ question_uid: string; n: number }>(
    `select a.question_uid, count(*)::int as n
       from answer a join submission s on s.id = a.submission_id
      where s.form_id = $1
      group by a.question_uid`,
    [formId],
  );
  return Object.fromEntries(rows.map((r) => [r.question_uid, r.n]));
}

/** Create the draft (a copy of the live version) or return the existing one. */
export async function ensureDraft(db: Db, ctx: AdminContext): Promise<VersionRow> {
  return db.transaction(async (tx) => {
    const form = await getTenantForm(tx, ctx.tenantId);
    const existing = await getDraft(tx, form.id);
    if (existing) return existing;
    const live = await getLiveVersion(tx, form.id);
    const doc = live?.doc ?? createDefaultDoc(ctx.tenantName);
    const id = newId('fv');
    await tx.query(
      `insert into form_version (id, form_id, status, doc, based_on_version_id, created_by)
       values ($1, $2, 'DRAFT', $3::jsonb, $4, $5)`,
      [id, form.id, JSON.stringify(doc), live?.id ?? null, ctx.userId],
    );
    await audit(tx, ctx, 'draft.create', { versionId: id, basedOn: live?.id ?? null });
    return (await getDraft(tx, form.id))!;
  });
}

/**
 * Replace the whole draft document. Optimistic locking: the caller must send the revision it
 * last saw; if someone else saved in between, they get 409 and must reload.
 */
export async function saveDraft(db: Db, ctx: AdminContext, revision: number, rawDoc: unknown) {
  const doc = parse(FormDoc, rawDoc);
  const form = await getTenantForm(db, ctx.tenantId);
  const { rows } = await db.query<{ revision: number; updated_at: Date }>(
    `update form_version set doc = $1::jsonb, revision = revision + 1, updated_at = now()
      where form_id = $2 and status = 'DRAFT' and revision = $3
      returning revision, updated_at`,
    [JSON.stringify(doc), form.id, revision],
  );
  if (rows[0]) return rows[0];
  const draft = await getDraft(db, form.id);
  if (!draft) throw new HttpError(404, 'no_draft', 'There is no draft. It may have been published or discarded.');
  throw new HttpError(409, 'draft_conflict', 'Someone else changed this draft. Reload to see the latest version.', {
    currentRevision: draft.revision,
  });
}

export async function discardDraft(db: Db, ctx: AdminContext) {
  const form = await getTenantForm(db, ctx.tenantId);
  const { rows } = await db.query<{ id: string }>(`delete from form_version where form_id = $1 and status = 'DRAFT' returning id`, [
    form.id,
  ]);
  if (rows[0]) await audit(db, ctx, 'draft.discard', { versionId: rows[0].id });
}

export async function checkDraft(db: Queryable, ctx: AdminContext) {
  const form = await getTenantForm(db, ctx.tenantId);
  const draft = await getDraft(db, form.id);
  if (!draft) throw new HttpError(404, 'no_draft', 'There is no draft to publish');
  const live = await getLiveVersion(db, form.id);
  const issues = validateForPublish(draft.doc, await getKnownQuestionTypes(db, form.id));
  return { draft, live, issues, diff: diffDocs(live?.doc ?? null, draft.doc) };
}

/**
 * Publish the draft atomically: live → ARCHIVED, draft → PUBLISHED (next number), pointer swap.
 * Existing submissions keep pointing at their own (now archived) version and are untouched.
 * Kiosks pick the new version up between visitors, never mid-form.
 */
export async function publishDraft(db: Db, ctx: AdminContext, revision: number) {
  return db.transaction(async (tx) => {
    const { draft, live, issues, diff } = await checkDraft(tx, ctx);
    if (draft.revision !== revision) {
      throw new HttpError(409, 'draft_conflict', 'The draft changed since you reviewed it. Please review again.', {
        currentRevision: draft.revision,
      });
    }
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length) throw new HttpError(422, 'draft_invalid', 'Fix the highlighted problems before publishing', { issues });

    const { rows } = await tx.query<{ n: number }>('select coalesce(max(number), 0)::int + 1 as n from form_version where form_id = $1', [
      draft.form_id,
    ]);
    const number = rows[0]!.n;
    if (live) await tx.query(`update form_version set status = 'ARCHIVED' where id = $1`, [live.id]);
    await tx.query(
      `update form_version set status = 'PUBLISHED', number = $2, published_at = now(), published_by = $3, updated_at = now()
        where id = $1`,
      [draft.id, number, ctx.userId],
    );
    await tx.query('update form set live_version_id = $1 where id = $2', [draft.id, draft.form_id]);
    await audit(tx, ctx, 'version.publish', {
      versionId: draft.id,
      number,
      previousVersionId: live?.id ?? null,
      added: diff.added.map((q) => q.uid),
      removed: diff.removed.map((q) => q.uid),
      modified: diff.modified.map((q) => q.uid),
      reordered: diff.reordered,
    });
    return { versionId: draft.id, number, warnings: issues.filter((i) => i.severity === 'warning') };
  });
}

/** Make an older (archived) version live again. Nothing is copied or deleted. */
export async function rollbackTo(db: Db, ctx: AdminContext, versionId: string) {
  return db.transaction(async (tx) => {
    const form = await getTenantForm(tx, ctx.tenantId);
    const target = await getReleasedVersion(tx, form.id, versionId);
    if (!target) throw new HttpError(404, 'version_not_found', 'Version not found');
    if (target.status === 'PUBLISHED') throw new HttpError(409, 'already_live', 'This version is already live');
    const live = await getLiveVersion(tx, form.id);
    if (live) await tx.query(`update form_version set status = 'ARCHIVED' where id = $1`, [live.id]);
    await tx.query(`update form_version set status = 'PUBLISHED' where id = $1`, [target.id]);
    await tx.query('update form set live_version_id = $1 where id = $2', [target.id, form.id]);
    await audit(tx, ctx, 'version.rollback', { versionId: target.id, number: target.number, previousVersionId: live?.id ?? null });
    return { versionId: target.id, number: target.number };
  });
}

export async function listVersions(db: Queryable, formId: string) {
  const { rows } = await db.query<{
    id: string;
    number: number;
    status: string;
    published_at: Date;
    published_by_name: string | null;
    submissions: number;
    question_count: number;
  }>(
    `select v.id, v.number, v.status, v.published_at, u.name as published_by_name,
            (select count(*)::int from submission s where s.version_id = v.id) as submissions,
            jsonb_array_length(v.doc->'questions')::int as question_count
       from form_version v
       left join admin_user u on u.id = v.published_by
      where v.form_id = $1 and v.status <> 'DRAFT'
      order by v.number desc`,
    [formId],
  );
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    publishedAt: r.published_at,
    publishedBy: r.published_by_name,
    submissions: r.submissions,
    questionCount: r.question_count,
  }));
}
