import {
  formatAnswer,
  isChoiceQuestion,
  t,
  type ChoiceValue,
  type FormDoc,
  type MultiChoiceValue,
  type Question,
} from '@ff/form-schema';
import type { Queryable } from '../db';
import { HttpError } from '../util';

interface VersionInfo {
  id: string;
  number: number;
  status: string;
  doc: FormDoc;
}

export interface CatalogEntry {
  uid: string;
  type: Question['type'];
  label: string;
  /** false when the question is not in the live version (removed later). */
  inLive: boolean;
  /** Latest definition of the question (labels/options for reporting). */
  question: Question;
  /** Option uid → latest label, merged across all versions. */
  optionLabels: Record<string, string>;
}

export async function loadVersions(db: Queryable, formId: string): Promise<VersionInfo[]> {
  const { rows } = await db.query<VersionInfo>(
    `select id, number, status, doc from form_version where form_id = $1 and status <> 'DRAFT' order by number desc`,
    [formId],
  );
  return rows;
}

/**
 * Every question that ever existed on this form, keyed by stable uid.
 * Order: live version order first, then removed questions (newest first).
 */
export function buildCatalog(versions: VersionInfo[]): CatalogEntry[] {
  const live = versions.find((v) => v.status === 'PUBLISHED');
  const ordered = live ? [live, ...versions.filter((v) => v !== live)] : versions;
  const catalog = new Map<string, CatalogEntry>();
  for (const v of ordered) {
    const L = v.doc.defaultLocale;
    for (const q of v.doc.questions) {
      if (q.type === 'section') continue;
      let entry = catalog.get(q.uid);
      if (!entry) {
        entry = { uid: q.uid, type: q.type, label: t(q.label, L), inLive: v === live, question: q, optionLabels: {} };
        catalog.set(q.uid, entry);
      }
      if (isChoiceQuestion(q)) {
        for (const o of q.options) entry.optionLabels[o.uid] ??= t(o.label, L);
      }
    }
  }
  return [...catalog.values()];
}

export interface ResponseFilter {
  versionId?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD inclusive
}

function filterSql(formId: string, f: ResponseFilter) {
  const where = ['s.form_id = $1'];
  const params: unknown[] = [formId];
  if (f.versionId) {
    params.push(f.versionId);
    where.push(`s.version_id = $${params.length}`);
  }
  if (f.from) {
    params.push(f.from);
    where.push(`s.received_at >= $${params.length}::date`);
  }
  if (f.to) {
    params.push(f.to);
    where.push(`s.received_at < ($${params.length}::date + 1)`);
  }
  return { where: where.join(' and '), params };
}

interface Cursor {
  r: string;
  i: string;
}
const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url');
function decodeCursor(s: string): Cursor {
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString());
    if (typeof c.r === 'string' && typeof c.i === 'string') return c;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, 'invalid_cursor', 'Invalid cursor');
}

interface SubmissionRow {
  id: string;
  version_id: string;
  channel: string;
  locale: string;
  duration_ms: number | null;
  received_at: Date;
  device_name: string | null;
}

async function loadAnswers(db: Queryable, ids: string[]) {
  const byId = new Map<string, Map<string, unknown>>();
  if (!ids.length) return byId;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await db.query<{ submission_id: string; question_uid: string; value: unknown }>(
    `select submission_id, question_uid, value from answer where submission_id in (${placeholders})`,
    ids,
  );
  for (const r of rows) {
    if (!byId.has(r.submission_id)) byId.set(r.submission_id, new Map());
    byId.get(r.submission_id)!.set(r.question_uid, r.value);
  }
  return byId;
}

/** Keyset-paginated responses, newest first, each answer formatted with its own version's labels. */
export async function listResponses(db: Queryable, formId: string, f: ResponseFilter & { cursor?: string; limit: number }) {
  const versions = await loadVersions(db, formId);
  const versionById = new Map(versions.map((v) => [v.id, v]));
  const { where, params } = filterSql(formId, f);
  if (f.cursor) {
    const c = decodeCursor(f.cursor);
    params.push(c.r, c.i);
  }
  const cursorSql = f.cursor ? ` and (s.received_at, s.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)` : '';
  params.push(f.limit + 1);
  const { rows } = await db.query<SubmissionRow>(
    `select s.id, s.version_id, s.channel, s.locale, s.duration_ms, s.received_at, d.name as device_name
       from submission s left join device d on d.id = s.device_id
      where ${where}${cursorSql}
      order by s.received_at desc, s.id desc
      limit $${params.length}`,
    params,
  );
  const page = rows.slice(0, f.limit);
  const answers = await loadAnswers(
    db,
    page.map((r) => r.id),
  );
  const items = page.map((r) => {
    const v = versionById.get(r.version_id)!;
    const a = answers.get(r.id) ?? new Map();
    return {
      id: r.id,
      receivedAt: r.received_at,
      versionNumber: v.number,
      channel: r.channel,
      deviceName: r.device_name,
      locale: r.locale,
      durationMs: r.duration_ms,
      answers: v.doc.questions
        .filter((q) => q.type !== 'section' && a.has(q.uid))
        .map((q) => ({
          questionUid: q.uid,
          label: t(q.label, v.doc.defaultLocale),
          display: formatAnswer(q, a.get(q.uid), v.doc.defaultLocale),
        })),
    };
  });
  const last = page[page.length - 1];
  return {
    items,
    nextCursor: rows.length > f.limit && last ? encodeCursor({ r: last.received_at.toISOString(), i: last.id }) : null,
  };
}

type Stats =
  | { kind: 'choice'; counts: Array<{ optionUid: string; label: string; count: number }>; otherTexts: string[] }
  | { kind: 'numeric'; average: number | null; distribution: Array<{ value: number; count: number }>; npsScore?: number | null }
  | { kind: 'boolean'; yes: number; no: number }
  | { kind: 'text'; latest: string[] }
  | { kind: 'private' };

/** Aggregates per question across versions (by stable uid). */
export async function summarize(db: Queryable, formId: string, f: ResponseFilter) {
  const versions = await loadVersions(db, formId);
  const catalog = buildCatalog(versions);
  const { where, params } = filterSql(formId, f);
  const total = await db.query<{ n: number }>(`select count(*)::int as n from submission s where ${where}`, params);
  const { rows } = await db.query<{ question_uid: string; value: unknown; received_at: Date }>(
    `select a.question_uid, a.value, s.received_at
       from answer a join submission s on s.id = a.submission_id
      where ${where}
      order by s.received_at desc`,
    params,
  );
  const byQuestion = new Map<string, unknown[]>();
  for (const r of rows) {
    if (!byQuestion.has(r.question_uid)) byQuestion.set(r.question_uid, []);
    byQuestion.get(r.question_uid)!.push(r.value);
  }

  const questions = catalog.map((c) => {
    const values = byQuestion.get(c.uid) ?? [];
    let stats: Stats;
    const q = c.question;
    switch (q.type) {
      case 'single_choice':
      case 'dropdown':
      case 'multi_choice': {
        const counts = new Map<string, number>();
        const otherTexts: string[] = [];
        for (const v of values) {
          const uids = q.type === 'multi_choice' ? (v as MultiChoiceValue).optionUids : [(v as ChoiceValue).optionUid];
          for (const u of uids) counts.set(u, (counts.get(u) ?? 0) + 1);
          const other = (v as ChoiceValue).otherText;
          if (other && otherTexts.length < 10) otherTexts.push(other);
        }
        const order = Object.keys(c.optionLabels);
        stats = {
          kind: 'choice',
          counts: order.map((u) => ({ optionUid: u, label: c.optionLabels[u]!, count: counts.get(u) ?? 0 })),
          otherTexts,
        };
        break;
      }
      case 'rating':
      case 'emoji':
      case 'nps':
      case 'slider':
      case 'number': {
        const nums = values.filter((v): v is number => typeof v === 'number');
        const dist = new Map<number, number>();
        for (const n of nums) dist.set(n, (dist.get(n) ?? 0) + 1);
        const range =
          q.type === 'rating'
            ? Array.from({ length: q.max }, (_, i) => i + 1)
            : q.type === 'emoji'
              ? [1, 2, 3, 4, 5]
              : q.type === 'nps'
                ? Array.from({ length: 11 }, (_, i) => i)
                : [...dist.keys()].sort((a, b) => a - b).slice(0, 50);
        stats = {
          kind: 'numeric',
          average: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null,
          distribution: range.map((value) => ({ value, count: dist.get(value) ?? 0 })),
        };
        if (q.type === 'nps') {
          const promoters = nums.filter((n) => n >= 9).length;
          const detractors = nums.filter((n) => n <= 6).length;
          stats.npsScore = nums.length ? Math.round(((promoters - detractors) / nums.length) * 100) : null;
        }
        break;
      }
      case 'yes_no':
      case 'consent':
        stats = { kind: 'boolean', yes: values.filter((v) => v === true).length, no: values.filter((v) => v === false).length };
        break;
      case 'email':
      case 'phone':
      case 'short_text':
        // Personal data is not shown in summaries; use the responses list / export instead.
        stats = { kind: 'private' };
        break;
      default:
        stats = { kind: 'text', latest: values.slice(0, 5).map(String) };
    }
    return { uid: c.uid, type: c.type, label: c.label, inLive: c.inLive, answered: values.length, stats };
  });

  return { totalResponses: total.rows[0]!.n, questions };
}

/** Neutralise spreadsheet formula injection ("=HYPERLINK(...)") and quote for CSV. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) || s.startsWith("'") ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with one column per question across ALL versions (removed questions marked). */
export async function exportCsv(db: Queryable, formId: string, f: ResponseFilter): Promise<string> {
  const versions = await loadVersions(db, formId);
  const versionById = new Map(versions.map((v) => [v.id, v]));
  const catalog = buildCatalog(versions);
  const { where, params } = filterSql(formId, f);
  const { rows } = await db.query<SubmissionRow>(
    `select s.id, s.version_id, s.channel, s.locale, s.duration_ms, s.received_at, d.name as device_name
       from submission s left join device d on d.id = s.device_id
      where ${where}
      order by s.received_at desc`,
    params,
  );
  const answers = await loadAnswers(
    db,
    rows.map((r) => r.id),
  );
  const header = [
    'Submission ID',
    'Received at (UTC)',
    'Form version',
    'Channel',
    'Device',
    'Language',
    'Duration (s)',
    ...catalog.map((c) => (c.inLive ? c.label : `${c.label} [removed]`)),
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) {
    const v = versionById.get(r.version_id)!;
    const qByUid = new Map(v.doc.questions.map((q) => [q.uid, q]));
    const a = answers.get(r.id) ?? new Map();
    const cells = [
      r.id,
      r.received_at.toISOString(),
      `v${v.number}`,
      r.channel,
      r.device_name ?? '',
      r.locale,
      r.duration_ms != null ? Math.round(r.duration_ms / 1000) : '',
      ...catalog.map((c) => {
        const q = qByUid.get(c.uid);
        return q && a.has(c.uid) ? formatAnswer(q, a.get(c.uid), v.doc.defaultLocale) : '';
      }),
    ];
    lines.push(cells.map(csvCell).join(','));
  }
  // BOM so Excel opens UTF-8 (Hindi / Marathi text) correctly.
  return `﻿${lines.join('\r\n')}\r\n`;
}
