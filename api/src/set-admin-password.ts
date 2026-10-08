/**
 * Set (or reset) the admin password from api/.env:
 *   1. edit ADMIN_PASSWORD (min 12 characters) in api/.env
 *   2. stop the API, run: npm run admin:password
 * Signs out all existing sessions of that account. The password is never printed.
 */
import { resolve } from 'node:path';
import { hashPassword } from './auth';
import { openConfiguredDb as openDbFrom } from './db';

try {
  process.loadEnvFile(resolve(import.meta.dirname, '../.env'));
} catch {
  /* optional */
}

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? '';
if (!email || password.length < 12) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (min 12 characters) in api/.env first.');
  process.exit(1);
}

const db = await openDbFrom(resolve(import.meta.dirname, '..', process.env.DATA_DIR ?? 'data/pgdata'));
try {
  const hash = await hashPassword(password);
  const { rows } = await db.query<{ id: string }>('update admin_user set password_hash = $2 where email = $1 returning id', [email, hash]);
  if (!rows[0]) {
    console.error(`No admin account with email ${email}.`);
    process.exitCode = 1;
  } else {
    await db.query('delete from admin_session where user_id = $1', [rows[0].id]);
    console.log(`Password updated for ${email}. Existing sessions were signed out.`);
  }
} finally {
  await db.close();
}
