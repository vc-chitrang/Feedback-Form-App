import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { admin, requireAdmin } from '../auth';
import {
  checkDraft,
  discardDraft,
  ensureDraft,
  getAnswerCounts,
  getDraft,
  getKnownQuestionTypes,
  getLiveVersion,
  getReleasedVersion,
  getTenantForm,
  listVersions,
  publishDraft,
  rollbackTo,
  saveDraft,
  type VersionRow,
} from '../services/forms';
import { HttpError, parse } from '../util';

const draftDto = (d: VersionRow | null) =>
  d && { id: d.id, revision: d.revision, doc: d.doc, basedOnVersionId: d.based_on_version_id, updatedAt: d.updated_at };

export async function adminFormRoutes(app: FastifyInstance) {
  const viewer = { preHandler: requireAdmin('viewer') };
  const editor = { preHandler: requireAdmin('editor') };

  /** Everything the builder needs in one call. */
  app.get('/api/admin/form', viewer, async (req) => {
    const ctx = admin(req);
    const form = await getTenantForm(app.db, ctx.tenantId);
    const [live, draft, answerCounts, knownTypes] = await Promise.all([
      getLiveVersion(app.db, form.id),
      getDraft(app.db, form.id),
      getAnswerCounts(app.db, form.id),
      getKnownQuestionTypes(app.db, form.id),
    ]);
    return {
      form: { id: form.id, name: form.name, publicSlug: form.public_slug },
      live: live && { id: live.id, number: live.number, doc: live.doc, publishedAt: live.published_at },
      draft: draftDto(draft),
      answerCounts,
      knownTypes,
    };
  });

  app.post('/api/admin/form/draft', editor, async (req) => draftDto(await ensureDraft(app.db, admin(req))));

  app.put('/api/admin/form/draft', { ...editor, bodyLimit: 1024 * 1024 }, async (req) => {
    const body = parse(z.object({ revision: z.number().int().positive(), doc: z.unknown() }), req.body);
    const saved = await saveDraft(app.db, admin(req), body.revision, body.doc);
    return { revision: saved.revision, updatedAt: saved.updated_at };
  });

  app.delete('/api/admin/form/draft', editor, async (req, reply) => {
    await discardDraft(app.db, admin(req));
    reply.code(204);
  });

  /** Dry-run of publish: issues + what will change. */
  app.get('/api/admin/form/draft/check', viewer, async (req) => {
    const { draft, issues, diff } = await checkDraft(app.db, admin(req));
    return {
      revision: draft.revision,
      issues,
      diff: {
        added: diff.added.map((q) => q.uid),
        removed: diff.removed.map((q) => q.uid),
        modified: diff.modified.map((q) => q.uid),
        reordered: diff.reordered,
        themeChanged: diff.themeChanged,
        settingsChanged: diff.settingsChanged,
        hasChanges: diff.hasChanges,
      },
    };
  });

  app.post('/api/admin/form/publish', editor, async (req) => {
    const body = parse(z.object({ revision: z.number().int().positive() }), req.body);
    return publishDraft(app.db, admin(req), body.revision);
  });

  app.get('/api/admin/form/versions', viewer, async (req) => {
    const form = await getTenantForm(app.db, admin(req).tenantId);
    return { items: await listVersions(app.db, form.id) };
  });

  app.get<{ Params: { id: string } }>('/api/admin/form/versions/:id', viewer, async (req) => {
    const form = await getTenantForm(app.db, admin(req).tenantId);
    const v = await getReleasedVersion(app.db, form.id, req.params.id);
    if (!v) throw new HttpError(404, 'version_not_found', 'Version not found');
    return { id: v.id, number: v.number, status: v.status, doc: v.doc, publishedAt: v.published_at };
  });

  app.post('/api/admin/form/rollback', editor, async (req) => {
    const body = parse(z.object({ versionId: z.string().min(1).max(64) }), req.body);
    return rollbackTo(app.db, admin(req), body.versionId);
  });
}
