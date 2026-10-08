/**
 * Supabase Edge Function entry (Deno). The SAME Fastify app as local development is built once
 * per warm instance, and each incoming Request is replayed into it with `app.inject` — so all
 * routes, validation, auth and rate limits are identical to local.
 *
 * Bundled to supabase/functions/api/index.js by `npm run build:edge -w api`.
 * Requests arrive as /api/... because the function is named "api".
 */
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { openPostgres } from './db';
import { SupabaseStorage } from './storage';

interface DenoLike {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): unknown;
}
const Deno = (globalThis as unknown as { Deno: DenoLike }).Deno;
const env = (name: string) => Deno.env.get(name) ?? '';
const list = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

let appPromise: Promise<FastifyInstance> | null = null;

function getApp(): Promise<FastifyInstance> {
  appPromise ??= (async () => {
    // SUPABASE_DB_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
    const db = await openPostgres(env('SUPABASE_DB_URL'), { max: 2 });
    const app = await buildApp({
      db,
      storage: new SupabaseStorage(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY')),
      config: {
        cookieSecure: true,
        corsOrigins: list(env('CORS_ORIGINS')),
        adminOrigins: list(env('ADMIN_ORIGINS')),
      },
      logger: { level: env('LOG_LEVEL') || 'warn', redact: ['req.headers.authorization', 'req.headers.cookie'] },
    });
    await app.ready();
    return app;
  })().catch((e) => {
    appPromise = null; // retry on next request instead of staying broken
    throw e;
  });
  return appPromise;
}

Deno.serve(async (req: Request) => {
  try {
    const app = await getApp();
    const url = new URL(req.url);
    // Normalise: /functions/v1/api/x → /api/x (depends on how the platform forwards the path).
    let path = url.pathname.replace(/^\/functions\/v1/, '');
    if (!path.startsWith('/api')) path = `/api${path}`;
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const res = await app.inject({
      method: req.method as 'GET',
      url: path + url.search,
      headers: Object.fromEntries(req.headers),
      payload: hasBody ? Buffer.from(await req.arrayBuffer()) : undefined,
      remoteAddress: (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || '0.0.0.0',
    });
    const headers = new Headers();
    for (const [k, v] of Object.entries(res.headers)) {
      if (v === undefined || k === 'content-length' || k === 'transfer-encoding' || k === 'connection') continue;
      for (const item of Array.isArray(v) ? v : [String(v)]) headers.append(k, item);
    }
    const body = res.statusCode === 204 || res.statusCode === 304 ? null : new Uint8Array(res.rawPayload);
    return new Response(body, { status: res.statusCode, headers });
  } catch (e) {
    console.error('edge handler failed', e);
    return new Response(JSON.stringify({ error: { code: 'internal', message: 'Service temporarily unavailable' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
