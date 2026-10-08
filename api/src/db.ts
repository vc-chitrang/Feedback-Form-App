import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { MIGRATIONS } from './migrations';

/** Anything that can run a parameterised query: the database or an open transaction. */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Tx extends Queryable {
  /** Run one or more statements without parameters (migrations). */
  exec(sql: string): Promise<unknown>;
}

/**
 * Minimal database interface used by the whole API. Two implementations:
 *  - PGlite (local PostgreSQL in a folder) for development;
 *  - a real PostgreSQL server (Supabase) when DATABASE_URL is set / in the edge function.
 */
export interface Db extends Tx {
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Local PostgreSQL (PGlite, compiled to WASM) persisted in a folder — no install needed.
 * @param dataDir folder path, or undefined for an in-memory database (tests).
 */
export async function openDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) mkdirSync(dirname(dataDir), { recursive: true }); // PGlite only creates the last folder
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  const db: Db = {
    query: (sql, params) => pg.query(sql, params),
    exec: (sql) => pg.exec(sql),
    transaction: (fn) => pg.transaction((tx) => fn({ query: (s, p) => tx.query(s, p), exec: (s) => tx.exec(s) })),
    close: () => pg.close(),
  };
  await migrate(db);
  return db;
}

/** Real PostgreSQL server, e.g. Supabase (use the pooler connection string). */
export async function openPostgres(url: string, opts: { max?: number } = {}): Promise<Db> {
  const { default: postgres } = await import('postgres');
  // prepare:false is required for Supabase's transaction pooler (port 6543).
  const sql = postgres(url, {
    max: opts.max ?? 3,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
    // The API already passes JSON.stringify(...) for ::jsonb params (same as PGlite). The driver's
    // default would JSON-encode that string a second time and store a JSON *string*, so pass
    // strings through untouched and parse json/jsonb columns on read.
    types: {
      json: {
        to: 3802,
        from: [114, 3802],
        serialize: (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v)),
        parse: (v: string) => JSON.parse(v),
      },
    },
  });
  type Unsafe = { unsafe(text: string, params?: never[]): PromiseLike<unknown> };
  const wrap = (q: Unsafe): Tx => ({
    query: async (text, params = []) => ({ rows: (await q.unsafe(text, params as never[])) as unknown as never[] }),
    exec: async (text) => q.unsafe(text),
  });
  const db: Db = {
    ...wrap(sql as unknown as Unsafe),
    transaction: (fn) => sql.begin((tx) => fn(wrap(tx as unknown as Unsafe))) as Promise<never>,
    close: () => sql.end({ timeout: 5 }),
  };
  await migrate(db);
  return db;
}

/** DATABASE_URL → Postgres/Supabase, otherwise the local PGlite folder. */
export function openConfiguredDb(localDataDir: string): Promise<Db> {
  const url = process.env.DATABASE_URL;
  return url ? openPostgres(url) : openDb(localDataDir);
}

async function migrate(db: Db) {
  await db.exec(`create table if not exists _migrations (id int primary key, applied_at timestamptz not null default now())`);
  const { rows } = await db.query<{ id: number }>('select id from _migrations');
  const applied = new Set(rows.map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query('insert into _migrations (id) values ($1)', [m.id]);
    });
  }
}
