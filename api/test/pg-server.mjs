// Dev helper: expose an in-memory PGlite over the Postgres wire protocol on :5433,
// so the test suite can exercise the real `postgres` driver used with Supabase.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: 5433, host: '127.0.0.1' });
await server.start();
console.log('pglite listening on 5433');
