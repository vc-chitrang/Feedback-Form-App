import { resolve } from 'node:path';
import { buildApp } from './app';
import { bootstrap } from './bootstrap';
import { openConfiguredDb } from './db';
import { LocalDiskStorage, SupabaseStorage } from './storage';

try {
  process.loadEnvFile(resolve(import.meta.dirname, '../.env'));
} catch {
  // .env is optional; values may come from the real environment.
}

const env = process.env;
const port = Number(env.PORT ?? 4000);
const host = env.HOST ?? '127.0.0.1';

// DATABASE_URL set → Supabase/Postgres; otherwise local PGlite folder.
const db = await openConfiguredDb(resolve(import.meta.dirname, '..', env.DATA_DIR ?? 'data/pgdata'));
const storage =
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? new SupabaseStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : new LocalDiskStorage(resolve(import.meta.dirname, '..', env.STORAGE_DIR ?? 'storage/uploads'));

const app = await buildApp({
  db,
  storage,
  config: {
    cookieSecure: env.COOKIE_SECURE === 'true',
    corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    adminOrigins: (env.ADMIN_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((s) => s.trim()),
  },
  logger: {
    level: env.LOG_LEVEL ?? 'info',
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    transport: env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
  },
});

await bootstrap(
  db,
  {
    tenantName: env.TENANT_NAME ?? 'Demo Museum',
    tenantSlug: env.TENANT_SLUG ?? 'demo-museum',
    adminEmail: env.ADMIN_EMAIL,
    adminPassword: env.ADMIN_PASSWORD,
  },
  app.log,
);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await db.close(); // flush PGlite to disk
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port, host });
