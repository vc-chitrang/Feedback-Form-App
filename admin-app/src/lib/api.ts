import type { FormDoc, PublishIssue, QuestionType } from '@ff/form-schema';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Fetch wrapper: JSON in/out, cookie auth, typed errors. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      ...rest,
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server. Check that the API is running.');
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error;
    if (res.status === 401 && path !== '/api/admin/auth/login') window.dispatchEvent(new Event('ff:unauthenticated'));
    throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return body as T;
}

// ---------- Response types ----------
export type Role = 'owner' | 'editor' | 'viewer';
export interface Me {
  user: { id: string; email: string; name: string; role: Role };
  tenant: { id: string; name: string; slug: string };
}

export interface DraftDto {
  id: string;
  revision: number;
  doc: FormDoc;
  basedOnVersionId: string | null;
  updatedAt: string;
}

export interface FormState {
  form: { id: string; name: string; publicSlug: string };
  live: { id: string; number: number; doc: FormDoc; publishedAt: string } | null;
  draft: DraftDto | null;
  answerCounts: Record<string, number>;
  knownTypes: Record<string, QuestionType>;
}

export interface DraftCheck {
  revision: number;
  issues: PublishIssue[];
  diff: {
    added: string[];
    removed: string[];
    modified: string[];
    reordered: boolean;
    themeChanged: boolean;
    settingsChanged: boolean;
    hasChanges: boolean;
  };
}

export interface VersionItem {
  id: string;
  number: number;
  status: 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string;
  publishedBy: string | null;
  submissions: number;
  questionCount: number;
}

export interface DeviceItem {
  id: string;
  name: string;
  runningVersion: { id: string; number: number } | null;
  outboxSize: number;
  appVersion: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface ResponseItem {
  id: string;
  receivedAt: string;
  versionNumber: number;
  channel: 'kiosk' | 'public';
  deviceName: string | null;
  locale: string;
  durationMs: number | null;
  answers: Array<{ questionUid: string; label: string; display: string }>;
}

export type QuestionStats =
  | { kind: 'choice'; counts: Array<{ optionUid: string; label: string; count: number }>; otherTexts: string[] }
  | { kind: 'numeric'; average: number | null; distribution: Array<{ value: number; count: number }>; npsScore?: number | null }
  | { kind: 'boolean'; yes: number; no: number }
  | { kind: 'text'; latest: string[] }
  | { kind: 'private' };

export interface Summary {
  totalResponses: number;
  questions: Array<{ uid: string; type: QuestionType; label: string; inLive: boolean; answered: number; stats: QuestionStats }>;
}
