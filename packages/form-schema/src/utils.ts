import type { I18nText } from './types';

/** Resolve localised text with fallback to the form's default locale, then any locale. */
export function t(text: I18nText | undefined | null, locale: string, fallbackLocale = 'en'): string {
  if (!text) return '';
  return text[locale] ?? text[fallbackLocale] ?? Object.values(text)[0] ?? '';
}

export function setText(text: I18nText | undefined, locale: string, value: string): I18nText {
  return { ...(text ?? {}), [locale]: value };
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Works in browsers (including insecure LAN http:// contexts) and Node 20+. */
export function randomString(len: number): string {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** New stable id for a question ("q_…") or option ("o_…"). */
export function newUid(prefix: 'q' | 'o'): string {
  return `${prefix}_${randomString(10)}`;
}

/**
 * RFC 4122 v4 UUID. `crypto.randomUUID` only exists in secure contexts, and phones opening the
 * QR link over plain http on the LAN are not secure contexts — so build it from getRandomValues.
 */
export function uuidv4(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** YYYY-MM-DD in the device's local timezone. */
export function localDateISO(d = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** JSON.stringify with sorted keys — Postgres jsonb does not preserve key order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

const COMMON_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'yahoo.co.in',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'rediffmail.com',
  'live.com',
];

/** "abc@gmial.com" → "abc@gmail.com". Returns null when nothing close is found. */
export function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (domain.length < 5 || COMMON_EMAIL_DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bestDist = 3;
  for (const d of COMMON_EMAIL_DOMAINS) {
    const dist = levenshtein(domain, d);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best ? `${email.slice(0, at).trim()}@${best}` : null;
}
