import Fastify, { type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { Db } from './db';
import type { BlobStorage } from './storage';
import { HttpError } from './util';
import { authRoutes } from './routes/auth';
import { adminFormRoutes } from './routes/admin-form';
import { adminDataRoutes, assetRoutes } from './routes/admin-data';
import { clientRoutes } from './routes/client';

export interface AppConfig {
  cookieSecure: boolean;
  /** Browser origins allowed to call /api/admin mutations (CSRF defence in depth). */
  adminOrigins: string[];
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    storage: BlobStorage;
    config: AppConfig;
  }
}

export async function buildApp(opts: { db: Db; storage: BlobStorage; config: AppConfig; logger?: FastifyServerOptions['logger'] }) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 512 * 1024 });

  app.decorate('db', opts.db);
  app.decorate('storage', opts.storage);
  app.decorate('config', opts.config);
  app.decorateRequest('admin', null);
  app.decorateRequest('device', null);

  await app.register(cookie);
  await app.register(multipart);
  await app.register(rateLimit, { global: false });

  // Admin mutations must come from the admin app's origin (cookie is also SameSite=Strict).
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/admin') || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    const origin = req.headers.origin;
    if (origin && !opts.config.adminOrigins.includes(origin)) {
      throw new HttpError(403, 'bad_origin', 'Request origin not allowed');
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      if (err.statusCode >= 500) req.log.error(err);
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    // Fastify / plugin errors (body too large, bad JSON, rate limited…) carry their own 4xx status.
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.code(e.statusCode).send({ error: { code: e.code ?? 'bad_request', message: e.message ?? 'Bad request' } });
    }
    req.log.error(err);
    return reply.code(500).send({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } });
  });

  app.get('/api/health', async () => {
    await app.db.query('select 1');
    return { ok: true };
  });

  await app.register(authRoutes);
  await app.register(adminFormRoutes);
  await app.register(adminDataRoutes);
  await app.register(assetRoutes);
  await app.register(clientRoutes);

  return app;
}
