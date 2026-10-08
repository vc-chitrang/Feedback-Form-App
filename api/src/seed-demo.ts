/**
 * Demo data: publishes extra form versions (covering every question type) and fills each
 * version with realistic dummy responses spread over the last ~60 days.
 *
 *   npm run seed:demo        (stop the API first — the local database allows one process)
 *
 * Uses the same services as the admin app (draft → publish → submit), so every version and
 * every dummy answer passes the real validation rules. Runs once; re-running is a no-op.
 * All names / emails / phone numbers are fictional (emails use the reserved example.com domain).
 */
import { resolve } from 'node:path';
import {
  createOption,
  createQuestion,
  isChoiceQuestion,
  newUid,
  uuidv4,
  type FormDoc,
  type Question,
} from '@ff/form-schema';
import type { AdminContext, Role } from './auth';
import { openConfiguredDb, type Db } from './db';
import { ensureDraft, getLiveVersion, getTenantForm, publishDraft, saveDraft } from './services/forms';
import { ingestSubmission } from './services/submissions';
import { newId, sha256, newSecret } from './util';

try {
  process.loadEnvFile(resolve(import.meta.dirname, '../.env'));
} catch {
  /* optional */
}

// ---------- deterministic random (same demo data every time) ----------
let seed = 20261008;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const chance = (p: number) => rand() < p;
/** Pick from values with relative weights (skews ratings positive, like real feedback). */
function weighted<T>(pairs: Array<[T, number]>): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[pairs.length - 1]![0];
}

const FIRST = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Ananya', 'Vihaan', 'Isha', 'Arjun', 'Saanvi', 'Neel', 'Tara', 'Emma', 'Liam', 'Sofia', 'Yusuf', 'Fatima', 'Kenji'];
const LAST = ['Sharma', 'Patil', 'Iyer', 'Desai', 'Khan', 'Fernandes', 'Kulkarni', 'Mehta', 'Rao', 'Joshi', "D'Souza", 'Smith', 'García', 'Tanaka'];
const AREAS = ['Colaba', 'Dadar', 'Andheri', 'Bandra', 'Thane', 'Navi Mumbai', 'Pune', 'Borivali', 'Chembur', 'Powai'];
const OTHER_TEXTS = ['Textiles', 'Arms and armour', 'Children’s gallery', 'Temporary exhibition', 'Garden'];
const COMMENTS = [
  'More seating inside the galleries would help.',
  'Loved the sculpture section, very well lit.',
  'Signage to the café was hard to find.',
  'Audio guide was excellent, please add more languages.',
  'Ticket queue was long around noon.',
  'Wonderful visit with the kids — the natural history section was a hit.',
  'Some labels are too small to read.',
  'Please extend opening hours on weekends.',
  'Staff were very helpful and friendly.',
  'Air conditioning in the upper floor was not working well.',
];
const NEXT_EXHIBITS = ['Mughal miniatures', 'Ancient coins of India', 'Textiles of Gujarat', 'Maritime history', 'Contemporary art'];

const L = (s: string) => ({ en: s });

// ---------- version content ----------
function findByLabel(doc: FormDoc, text: string): Question | undefined {
  return doc.questions.find((q) => q.label.en === text);
}

/** v3: every question type, including restoring the age question removed in v2 (same id). */
function buildV3(base: FormDoc, removedAge: Question | undefined): FormDoc {
  const doc = structuredClone(base);
  const q = <T extends Question>(x: T) => x;

  const city = q({
    ...createQuestion('dropdown'),
    label: L('Which city are you visiting from?'),
    placeholder: L('Choose your city'),
    options: ['Mumbai', 'Pune', 'Delhi', 'Bengaluru', 'Ahmedabad', 'Kolkata', 'Chennai', 'Outside India'].map((s) => createOption('en', s)),
  });
  const area = q({ ...createQuestion('short_text'), label: L('Area / locality'), placeholder: L('e.g. Dadar'), maxLength: 60 });
  const group = q({ ...createQuestion('number'), label: L('How many people are in your group?'), min: 1, max: 60, integer: true, unit: L('people') });
  const visitDate = q({ ...createQuestion('date'), label: L('Date of your visit'), disallowFuture: true });
  const crowd = q({
    ...createQuestion('slider'),
    label: L('How crowded did the museum feel?'),
    min: 0,
    max: 100,
    step: 10,
    minLabel: L('Empty'),
    maxLabel: L('Packed'),
    unit: L('%'),
  });
  const audio = q({ ...createQuestion('emoji'), label: L('How was the audio guide?'), help: L('Skip if you did not use it') });
  const facilities = q({
    ...createQuestion('multi_choice'),
    label: L('Which facilities did you use?'),
    options: [...['Café', 'Gift shop', 'Audio guide', 'Cloakroom', 'Restrooms'].map((s) => createOption('en', s)), { ...createOption('en', 'None of these'), exclusive: true }],
  });
  const cleanliness = q({ ...createQuestion('rating'), label: L('Rate the cleanliness of the galleries'), max: 10, required: true });
  const about = q({ ...createQuestion('section'), label: L('About your visit'), help: L('A few quick questions about today.') });

  const byLabel = (t: string) => findByLabel(doc, t);
  const rating = byLabel('How would you rate your overall visit?')!;
  const firstVisit = byLabel('Is this your first visit?');
  const visitedWith = byLabel('Who did you visit with today?')!;
  const galleries = byLabel('Which galleries did you enjoy the most?')!;
  const nps = byLabel('How likely are you to recommend us to friends or family?')!;
  const improve = byLabel('Is there anything we could do better?')!;
  const rest = doc.questions.filter((x) => ![rating, firstVisit, visitedWith, galleries, nps, improve].includes(x));

  doc.questions = [
    about,
    rating,
    cleanliness,
    ...(firstVisit ? [firstVisit] : []),
    visitedWith,
    group,
    ...(removedAge ? [structuredClone(removedAge)] : []),
    city,
    area,
    visitDate,
    galleries,
    facilities,
    audio,
    crowd,
    nps,
    improve,
    ...rest, // contact section, name, email, phone, consent
  ];
  return doc;
}

/** v4: streamlined — remove a few, rename an option, reorder, add one new question. */
function buildV4(base: FormDoc): FormDoc {
  const doc = structuredClone(base);
  const drop = ['How crowded did the museum feel?', 'How many people are in your group?', 'Area / locality', 'Date of your visit', 'About your visit'];
  doc.questions = doc.questions.filter((q) => !drop.includes(q.label.en ?? ''));

  const visitedWith = findByLabel(doc, 'Who did you visit with today?');
  if (visitedWith && isChoiceQuestion(visitedWith)) {
    const tour = visitedWith.options.find((o) => o.label.en === 'Tour group');
    if (tour) tour.label = L('Guided tour'); // same option id → reports merge old + new answers
  }
  const nps = findByLabel(doc, 'How likely are you to recommend us to friends or family?')!;
  doc.questions = [nps, ...doc.questions.filter((q) => q !== nps)]; // NPS first

  const nextExhibit = { ...createQuestion('short_text'), uid: newUid('q'), label: L('Which exhibition would you like to see next?'), maxLength: 80 };
  const improveIdx = doc.questions.findIndex((q) => q.label.en === 'Is there anything we could do better?');
  doc.questions.splice(improveIdx + 1, 0, nextExhibit);
  doc.theme.welcome.subtitle = L('Tell us about today — it takes about a minute.');
  return doc;
}

// ---------- dummy answers ----------
function answerFor(q: Question, visit: Date, person: { first: string; last: string }): unknown {
  switch (q.type) {
    case 'section':
      return undefined;
    case 'single_choice':
    case 'dropdown': {
      const o = pick(q.options);
      return o.isOther ? { optionUid: o.uid, otherText: pick(OTHER_TEXTS) } : { optionUid: o.uid };
    }
    case 'multi_choice': {
      const exclusive = q.options.find((o) => o.exclusive);
      if (exclusive && chance(0.12)) return { optionUids: [exclusive.uid] };
      const pool = q.options.filter((o) => !o.exclusive);
      const max = Math.min(q.maxSelect ?? pool.length, pool.length, 4);
      const n = int(Math.max(1, q.minSelect ?? 1), max);
      const chosen = [...pool].sort(() => rand() - 0.5).slice(0, n);
      const other = chosen.find((o) => o.isOther);
      return { optionUids: chosen.map((o) => o.uid), ...(other ? { otherText: pick(OTHER_TEXTS) } : {}) };
    }
    case 'short_text':
      if (q.format === 'name') return `${person.first} ${person.last}`;
      if (q.label.en?.startsWith('Which exhibition')) return pick(NEXT_EXHIBITS);
      return pick(AREAS);
    case 'long_text':
      return pick(COMMENTS);
    case 'email':
      return `${person.first}.${person.last}`.toLowerCase().replace(/[^a-z.]/g, '') + `${int(1, 99)}@example.com`;
    case 'phone':
      return `+91 98765 ${String(int(10000, 99999))}`;
    case 'number':
      return int(q.min ?? 1, Math.min(q.max ?? 8, 8));
    case 'slider':
      return q.min + q.step * int(0, Math.floor((q.max - q.min) / q.step));
    case 'rating':
      return q.max === 5
        ? weighted([[5, 45], [4, 30], [3, 14], [2, 7], [1, 4]])
        : weighted(Array.from({ length: q.max }, (_, i) => [i + 1, (i + 1) ** 2] as [number, number]));
    case 'emoji':
      return weighted([[5, 35], [4, 35], [3, 18], [2, 8], [1, 4]]);
    case 'nps':
      return weighted([[10, 25], [9, 22], [8, 18], [7, 12], [6, 8], [5, 6], [4, 3], [3, 2], [2, 2], [1, 1], [0, 1]]);
    case 'yes_no':
      return chance(0.6);
    case 'date':
      return visit.toISOString().slice(0, 10);
    case 'consent':
      return true;
  }
}

function buildAnswers(doc: FormDoc, visit: Date) {
  const person = { first: pick(FIRST), last: pick(LAST) };
  const sharesContact = chance(0.4);
  const contactTypes = new Set(['short_text', 'email', 'phone', 'consent']);
  const answers: Array<{ questionUid: string; value: unknown }> = [];
  for (const q of doc.questions) {
    if (q.type === 'section') continue;
    const isContact = contactTypes.has(q.type) && (q.type !== 'short_text' || q.format === 'name');
    const skip = !q.required && (isContact ? !sharesContact : chance(0.15));
    if (skip) continue;
    const value = answerFor(q, visit, person);
    if (value !== undefined) answers.push({ questionUid: q.uid, value });
  }
  return answers;
}

// ---------- main ----------
async function getOwnerContext(db: Db): Promise<AdminContext> {
  const { rows } = await db.query<{ id: string; tenant_id: string; role: Role; email: string; name: string; tname: string; slug: string }>(
    `select u.id, u.tenant_id, u.role, u.email, u.name, t.name as tname, t.slug
       from admin_user u join tenant t on t.id = u.tenant_id
      where u.role = 'owner' and u.disabled_at is null order by u.created_at limit 1`,
  );
  const r = rows[0];
  if (!r) throw new Error('No owner account found. Start the API once (npm run dev) so it bootstraps, then stop it and run this again.');
  return { userId: r.id, tenantId: r.tenant_id, role: r.role, email: r.email, name: r.name, tenantName: r.tname, tenantSlug: r.slug };
}

async function publish(db: Db, ctx: AdminContext, build: (live: FormDoc) => FormDoc, publishedDaysAgo: number) {
  const draft = await ensureDraft(db, ctx);
  const saved = await saveDraft(db, ctx, draft.revision, build(draft.doc));
  const r = await publishDraft(db, ctx, saved.revision);
  // Backdate so the version timeline looks realistic (published_at is not part of the immutable content).
  await db.query(`update form_version set published_at = now() - ($2 || ' days')::interval where id = $1`, [r.versionId, String(publishedDaysAgo)]);
  console.log(`  published v${r.number}${r.warnings.length ? ` (${r.warnings.length} warning(s))` : ''}`);
  return r.versionId;
}

async function ensureDevice(db: Db, ctx: AdminContext, formId: string, name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>('select id from device where tenant_id = $1 and name = $2 and revoked_at is null limit 1', [ctx.tenantId, name]);
  if (rows[0]) return rows[0].id;
  const id = newId('dev');
  // Demo-only device: random token that is never shown (cannot be used to log in as a kiosk).
  await db.query('insert into device (id, tenant_id, form_id, name, token_hash, last_seen_at) values ($1, $2, $3, $4, $5, now() - interval \'2 days\')', [
    id,
    ctx.tenantId,
    formId,
    name,
    sha256(newSecret()),
  ]);
  return id;
}

async function fill(db: Db, ctx: AdminContext, formId: string, versionId: string, count: number, fromDaysAgo: number, toDaysAgo: number, devices: string[]) {
  const { rows } = await db.query<{ doc: FormDoc }>('select doc from form_version where id = $1', [versionId]);
  const doc = rows[0]!.doc;
  for (let i = 0; i < count; i++) {
    const daysAgo = fromDaysAgo - rand() * (fromDaysAgo - toDaysAgo);
    const visit = new Date(Date.now() - daysAgo * 86_400_000);
    visit.setHours(int(10, 17), int(0, 59), int(0, 59)); // museum opening hours
    const durationMs = int(35, 240) * 1000;
    const kiosk = chance(0.75);
    const id = uuidv4();
    await ingestSubmission(
      db,
      { tenantId: ctx.tenantId, formId, deviceId: kiosk ? pick(devices) : null, channel: kiosk ? 'kiosk' : 'public' },
      {
        id,
        versionId,
        locale: 'en',
        startedAt: new Date(visit.getTime() - durationMs).toISOString(),
        deviceSubmittedAt: visit.toISOString(),
        durationMs,
        answers: buildAnswers(doc, visit),
      },
    );
    await db.query('update submission set received_at = $2 where id = $1', [id, visit]);
  }
  console.log(`  +${count} responses on version ${versionId}`);
}

async function main() {
  const db = await openConfiguredDb(resolve(import.meta.dirname, '..', process.env.DATA_DIR ?? 'data/pgdata'));
  try {
    const ctx = await getOwnerContext(db);
    const already = await db.query<{ n: number }>(`select count(*)::int as n from audit_log where tenant_id = $1 and action = 'demo.seed'`, [ctx.tenantId]);
    if (already.rows[0]!.n > 0) {
      console.log('Demo data already present — nothing to do. (Delete api/data/ to start completely fresh.)');
      return;
    }
    const form = await getTenantForm(db, ctx.tenantId);
    const { rows: draftRows } = await db.query<{ n: number }>(`select count(*)::int as n from form_version where form_id = $1 and status = 'DRAFT'`, [form.id]);
    if (draftRows[0]!.n > 0) throw new Error('An unpublished draft is open in the admin app. Publish or discard it first, then run the seed again.');

    console.log(`Seeding demo data for "${ctx.tenantName}"…`);
    const devices = [await ensureDevice(db, ctx, form.id, 'Main exit'), await ensureDevice(db, ctx, form.id, 'Gallery 2 – first floor')];

    // Existing versions get backfilled responses first.
    const { rows: existing } = await db.query<{ id: string; number: number; doc: FormDoc }>(
      `select id, number, doc from form_version where form_id = $1 and status <> 'DRAFT' order by number`,
      [form.id],
    );
    // The age question removed in v2 (if any) is restored in v3 with the SAME id.
    const removedAge = existing
      .flatMap((v) => v.doc.questions)
      .find((q) => q.label.en === 'Your age group' && !existing[existing.length - 1]!.doc.questions.some((x) => x.uid === q.uid));

    let window = 70;
    for (const v of existing) {
      // Keep the timeline consistent: a version is published just before its responses start.
      await db.query(`update form_version set published_at = now() - ($2 || ' days')::interval where id = $1`, [v.id, String(window + 1)]);
      await fill(db, ctx, form.id, v.id, int(25, 35), window, window - 12, devices);
      window -= 13;
    }

    const live = await getLiveVersion(db, form.id);
    if (!live) throw new Error('No live version to build on');
    const v3 = await publish(db, ctx, (d) => buildV3(d, removedAge), Math.max(window, 20));
    await fill(db, ctx, form.id, v3, 60, Math.max(window, 20), 9, devices);
    const v4 = await publish(db, ctx, buildV4, 8);
    await fill(db, ctx, form.id, v4, 45, 8, 0, devices);

    await db.query(`insert into audit_log (tenant_id, user_id, action, details) values ($1, $2, 'demo.seed', '{}'::jsonb)`, [ctx.tenantId, ctx.userId]);
    console.log('Done. Start the API again with: npm run dev');
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(`\nSeed failed: ${e instanceof Error ? e.message : e}`);
  if (String(e).includes('lock') || String(e).includes('EBUSY')) console.error('Is the API still running? Stop it first.');
  process.exit(1);
});
