import { createHash, randomBytes } from 'node:crypto';
import type { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Parse untrusted input with a zod schema, or throw a 400 with field details. */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new HttpError(400, 'invalid_request', 'Request validation failed', r.error.issues.slice(0, 20));
  }
  return r.data;
}

/** Opaque prefixed id, e.g. "fv_3k9x…". */
export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString('hex')}`;
}

/** 256-bit random secret, URL-safe. */
export function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** Secrets (session / device tokens, pairing codes) are stored only as SHA-256 hashes. */
export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/** YYYY-MM-DD in UTC, shifted by `days`. */
export function utcDateISO(days = 0): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
