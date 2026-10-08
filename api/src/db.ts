import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { MIGRATIONS } from './migrations';

export type Db = PGlite;
/** Anything that can run a query: the database or an open transaction. */
export type Queryable = Pick<PGlite | Transaction, 'query'>;

/**
 * Local PostgreSQL (PGlite, compiled to WASM) persisted in a folder — no install needed.
 * Swapping to a real Postgres server later only touches this file.
 * @param dataDir folder path, or undefined for an in-memory database (tests).
 */
export async function openDb(dataDir?: string): Promise<Db> {
  if (dataDir) mkdirSync(dirname(dataDir), { recursive: true }); // PGlite only creates the last folder
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  await migrate(db);
  return db;
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
