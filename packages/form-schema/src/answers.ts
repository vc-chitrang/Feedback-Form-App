import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import type { FormDoc, Question } from './types';
import { localDateISO, t } from './utils';

export type ChoiceValue = { optionUid: string; otherText?: string };
export type MultiChoiceValue = { optionUids: string[]; otherText?: string };
/** Normalised answer value as stored in the database. */
export type AnswerValue = string | number | boolean | ChoiceValue | MultiChoiceValue;

export type CheckResult = { ok: true; value: AnswerValue | null } | { ok: false; error: string };

export interface CheckOptions {
  /**
   * Date bounds for "no future / no past" checks. The client passes its local today;
   * the server passes a ±1 day window so visitors in other timezones are not rejected.
   */
  today?: { earliest: string; latest: string };
}

export const EMOJI_SCALE = [
  { value: 1, emoji: '😞', label: 'Very poor' },
  { value: 2, emoji: '🙁', label: 'Poor' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😍', label: 'Loved it' },
] as const;

export const TEXT_LIMITS = { shortText: 100, longText: 1000, otherText: 200, email: 254 } as const;

const ok = (value: AnswerValue | null): CheckResult => ({ ok: true, value });
const fail = (error: string): CheckResult => ({ ok: false, error });

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Unicode-normalise, strip control characters, collapse whitespace. */
export function cleanText(s: string, multiline: boolean): string {
  const v = s.normalize('NFC').replace(CONTROL_CHARS, '');
  if (multiline) {
    return v
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return v.replace(/\s+/g, ' ').trim();
}

/** Length in user-visible characters (emoji / Devanagari safe-ish). */
export const charLength = (s: string) => [...s].length;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isBlank(q: Question, raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === 'string') return raw.trim() === '';
  if (q.type === 'consent') return raw === false;
  if (q.type === 'multi_choice' && isObject(raw) && Array.isArray(raw.optionUids)) {
    return raw.optionUids.length === 0;
  }
  if ((q.type === 'single_choice' || q.type === 'dropdown') && isObject(raw)) {
    return !raw.optionUid;
  }
  return false;
}

function toNumber(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && /^-?\d+(\.\d+)?$/.test(raw.trim())) return Number(raw.trim());
  return Number.NaN;
}

function requiredMessage(q: Question): string {
  switch (q.type) {
    case 'single_choice':
    case 'dropdown':
    case 'yes_no':
      return 'Please choose an option';
    case 'multi_choice':
      return 'Please choose at least one option';
    case 'rating':
    case 'emoji':
    case 'nps':
    case 'slider':
      return 'Please pick a value';
    case 'consent':
      return 'Please tick the box to continue';
    default:
      return 'This field is required';
  }
}

function checkOtherText(raw: Record<string, unknown>): CheckResult | string {
  if (typeof raw.otherText !== 'string') return fail('Please specify');
  const text = cleanText(raw.otherText, false);
  if (!text) return fail('Please specify');
  if (charLength(text) > TEXT_LIMITS.otherText) return fail(`Keep it under ${TEXT_LIMITS.otherText} characters`);
  return text;
}

/**
 * Validate + normalise one answer against its question definition.
 * Used by the client (UX) and the server (source of truth) — same rules on both sides.
 */
export function checkAnswer(q: Question, raw: unknown, opts: CheckOptions = {}): CheckResult {
  if (q.type === 'section') return raw == null ? ok(null) : fail('This item does not take an answer');
  if (isBlank(q, raw)) return q.required ? fail(requiredMessage(q)) : ok(null);

  switch (q.type) {
    case 'short_text': {
      if (typeof raw !== 'string') return fail('Enter text');
      const v = cleanText(raw, false);
      const max = q.maxLength ?? TEXT_LIMITS.shortText;
      if (charLength(v) > max) return fail(`Keep it under ${max} characters`);
      if (q.format === 'name' && !NAME_RE.test(v)) {
        return fail('Use letters only (spaces, hyphens and apostrophes are fine)');
      }
      return ok(v);
    }
    case 'long_text': {
      if (typeof raw !== 'string') return fail('Enter text');
      const v = cleanText(raw, true);
      const max = q.maxLength ?? TEXT_LIMITS.longText;
      if (charLength(v) > max) return fail(`Keep it under ${max} characters`);
      return ok(v);
    }
    case 'email': {
      if (typeof raw !== 'string') return fail('Enter an email address');
      const v = raw.trim().toLowerCase();
      if (v.length > TEXT_LIMITS.email || !EMAIL_RE.test(v) || v.includes('..')) {
        return fail('Enter a valid email address, like name@example.com');
      }
      return ok(v);
    }
    case 'phone': {
      if (typeof raw !== 'string' || raw.length > 40) return fail('Enter a valid phone number');
      const parsed = parsePhoneNumberFromString(raw, (q.defaultCountry ?? 'IN') as CountryCode);
      if (!parsed || !parsed.isValid()) return fail('Enter a valid phone number');
      return ok(parsed.number); // E.164, e.g. +919812345678
    }
    case 'number': {
      const n = toNumber(raw);
      if (!Number.isFinite(n)) return fail('Enter a number');
      if (q.integer && !Number.isInteger(n)) return fail('Enter a whole number');
      if (q.min !== undefined && n < q.min) return fail(`Must be at least ${q.min}`);
      if (q.max !== undefined && n > q.max) return fail(`Must be at most ${q.max}`);
      return ok(n);
    }
    case 'slider': {
      const n = toNumber(raw);
      if (!Number.isFinite(n) || n < q.min || n > q.max) return fail('Pick a value on the slider');
      const steps = (n - q.min) / q.step;
      if (Math.abs(steps - Math.round(steps)) > 1e-6) return fail('Pick a value on the slider');
      return ok(n);
    }
    case 'rating': {
      const n = toNumber(raw);
      if (!Number.isInteger(n) || n < 1 || n > q.max) return fail(`Choose 1 to ${q.max}`);
      return ok(n);
    }
    case 'emoji': {
      const n = toNumber(raw);
      if (!Number.isInteger(n) || n < 1 || n > 5) return fail('Choose one of the faces');
      return ok(n);
    }
    case 'nps': {
      const n = toNumber(raw);
      if (!Number.isInteger(n) || n < 0 || n > 10) return fail('Choose 0 to 10');
      return ok(n);
    }
    case 'yes_no':
      return typeof raw === 'boolean' ? ok(raw) : fail('Choose Yes or No');
    case 'consent':
      return raw === true ? ok(true) : fail('Please tick the box to continue');
    case 'date': {
      if (typeof raw !== 'string') return fail('Enter a valid date');
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
      if (!m) return fail('Enter a valid date');
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const date = new Date(Date.UTC(y, mo - 1, d));
      if (y < 1900 || date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
        return fail('Enter a valid date');
      }
      const today = opts.today ?? { earliest: localDateISO(), latest: localDateISO() };
      if (q.disallowFuture && raw > today.latest) return fail('Date cannot be in the future');
      if (q.disallowPast && raw < today.earliest) return fail('Date cannot be in the past');
      return ok(raw);
    }
    case 'single_choice':
    case 'dropdown': {
      if (!isObject(raw) || typeof raw.optionUid !== 'string') return fail('Please choose an option');
      const opt = q.options.find((o) => o.uid === raw.optionUid);
      if (!opt) return fail('Please choose an option');
      if (opt.isOther) {
        const other = checkOtherText(raw);
        if (typeof other !== 'string') return other;
        return ok({ optionUid: opt.uid, otherText: other });
      }
      return ok({ optionUid: opt.uid });
    }
    case 'multi_choice': {
      if (!isObject(raw) || !Array.isArray(raw.optionUids)) return fail('Please choose an option');
      const uids = raw.optionUids;
      if (!uids.every((u): u is string => typeof u === 'string')) return fail('Please choose an option');
      if (new Set(uids).size !== uids.length) return fail('Duplicate selection');
      const selected = uids.map((u) => q.options.find((o) => o.uid === u));
      if (selected.some((o) => !o)) return fail('Please choose from the list');
      const exclusive = selected.find((o) => o!.exclusive);
      if (exclusive && selected.length > 1) {
        return fail(`"${t(exclusive.label, 'en')}" cannot be combined with other choices`);
      }
      if (q.minSelect !== undefined && uids.length < q.minSelect) return fail(`Choose at least ${q.minSelect}`);
      if (q.maxSelect !== undefined && uids.length > q.maxSelect) return fail(`Choose up to ${q.maxSelect}`);
      // Keep the order of the options as defined, not tap order.
      const ordered = q.options.filter((o) => uids.includes(o.uid)).map((o) => o.uid);
      if (selected.some((o) => o!.isOther)) {
        const other = checkOtherText(raw);
        if (typeof other !== 'string') return other;
        return ok({ optionUids: ordered, otherText: other });
      }
      return ok({ optionUids: ordered });
    }
  }
}

export interface SubmissionCheck {
  ok: boolean;
  /** Normalised non-empty answers keyed by question uid. */
  values: Record<string, AnswerValue>;
  /** Error per question uid. */
  errors: Record<string, string>;
}

/**
 * Validate a whole submission against the EXACT version it was filled on.
 * Rejects unknown question ids, duplicates and answers for non-input items.
 */
export function validateSubmission(
  doc: FormDoc,
  answers: Record<string, unknown> | Array<{ questionUid: string; value?: unknown }>,
  opts: CheckOptions = {},
): SubmissionCheck {
  const errors: Record<string, string> = {};
  const map = new Map<string, unknown>();
  if (Array.isArray(answers)) {
    for (const a of answers) {
      if (map.has(a.questionUid)) errors[a.questionUid] = 'Duplicate answer';
      map.set(a.questionUid, a.value);
    }
  } else {
    for (const [k, v] of Object.entries(answers)) map.set(k, v);
  }
  const known = new Set(doc.questions.map((q) => q.uid));
  for (const uid of map.keys()) if (!known.has(uid)) errors[uid] = 'Unknown question';

  const values: Record<string, AnswerValue> = {};
  for (const q of doc.questions) {
    const r = checkAnswer(q, map.get(q.uid), opts);
    if (!r.ok) errors[q.uid] = r.error;
    else if (r.value !== null) values[q.uid] = r.value;
  }
  return { ok: Object.keys(errors).length === 0, values, errors };
}

/** Human-readable answer for tables and CSV, using the labels of the version it was given on. */
export function formatAnswer(q: Question, value: unknown, locale: string): string {
  if (value === null || value === undefined) return '';
  const L = locale;
  switch (q.type) {
    case 'single_choice':
    case 'dropdown': {
      const v = value as ChoiceValue;
      const opt = q.options.find((o) => o.uid === v.optionUid);
      const label = opt ? t(opt.label, L) : '(unknown option)';
      return v.otherText ? `${label}: ${v.otherText}` : label;
    }
    case 'multi_choice': {
      const v = value as MultiChoiceValue;
      const labels = v.optionUids.map((u) => {
        const opt = q.options.find((o) => o.uid === u);
        const label = opt ? t(opt.label, L) : '(unknown option)';
        return opt?.isOther && v.otherText ? `${label}: ${v.otherText}` : label;
      });
      return labels.join('; ');
    }
    case 'yes_no':
      return value ? 'Yes' : 'No';
    case 'consent':
      return value ? 'Agreed' : '';
    case 'rating':
      return `${value}/${q.max}`;
    case 'emoji': {
      const e = EMOJI_SCALE.find((x) => x.value === value);
      return e ? `${value}/5 (${e.label})` : String(value);
    }
    default:
      return String(value);
  }
}
