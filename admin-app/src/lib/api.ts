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

/**
 * API location. Empty locally (Vite proxies /api); set VITE_API_BASE for the hosted build,
 * e.g. https://<project>.supabase.co/functions/v1
 */
export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '');
export const apiUrl = (path: string) => (path.startsWith('/api') ? `${API_BASE}${path}` : path);
/** Logo URLs are stored as "/api/assets/…"; resolve them against the API host. */
export const assetUrl = (url: string | null | undefined) => (url ? apiUrl(url) : null);

// Cross-origin hosting can't rely on the httpOnly cookie, so the session token is also kept in
// sessionStorage (cleared when the tab closes) and sent as a Bearer header.
const TOKEN_KEY = 'ff_admin_token';
export const sessionStore = {
  get: () => {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable: cookie auth still works same-origin */
    }
  },
};

/** Fetch wrapper: JSON in/out, cookie or bearer auth, typed errors. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const token = sessionStore.get();
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      credentials: 'same-origin',
      ...rest,
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server. Check that the API is running.');
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error;
    if (res.status === 401 && path !== '/api/admin/auth/login') {
      sessionStore.set(null);
      window.dispatchEvent(new Event('ff:unauthenticated'));
    }
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
