// Deploy the API to Supabase Edge Functions and (first time only) load local data.
//
//   npm run deploy:supabase -w api
//
// Reads from api/.env (never committed):
//   SUPABASE_ACCESS_TOKEN  personal access token — supabase.com/dashboard/account/tokens
//   SUPABASE_PROJECT_REF   e.g. xzaaiztphayjjnvkkmvl
//   CORS_ORIGINS           e.g. https://vc-chitrang.github.io (hosted admin/client origin)
// Steps: build bundle → set function secrets → deploy "api" → health check (runs migrations)
//        → if the database has no organisation yet, load api/data/export.sql.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
try {
  process.loadEnvFile(here('./.env'));
} catch {
  /* env may come from the shell / CI */
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
const origins = process.env.CORS_ORIGINS ?? '';
if (!token || !ref) {
  console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF in api/.env');
  process.exit(1);
}

const MGMT = `https://api.supabase.com/v1/projects/${ref}`;
const auth = { Authorization: `Bearer ${token}` };

async function call(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${MGMT}${path}`, {
    method,
    headers: { ...auth, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}
const sqlQuery = (query) => call('POST', '/database/query', { query });

console.log('1/5 Building edge bundle…');
execSync('node build-edge.mjs', { cwd: here('.'), stdio: 'inherit' });

console.log('2/5 Setting function secrets…');
await call('POST', '/secrets', [
  { name: 'CORS_ORIGINS', value: origins },
  { name: 'ADMIN_ORIGINS', value: origins },
]);

console.log('3/5 Deploying function "api"…');
const form = new FormData();
form.append('metadata', JSON.stringify({ name: 'api', entrypoint_path: 'index.js', verify_jwt: false }));
form.append('file', new Blob([readFileSync(here('../supabase/functions/api/index.js'))], { type: 'application/javascript' }), 'index.js');
const fn = await call('POST', '/functions/deploy?slug=api', form);
console.log(`   deployed version ${fn?.version ?? '?'} (${fn?.status ?? 'ok'})`);

console.log('4/5 Health check (first call runs database migrations)…');
const base = `https://${ref}.supabase.co/functions/v1/api`;
let healthy = false;
for (let i = 0; i < 12 && !healthy; i++) {
  const r = await fetch(`${base}/health`).catch(() => null);
  healthy = !!r && r.ok;
  if (!healthy) await new Promise((s) => setTimeout(s, 5000));
}
if (!healthy) throw new Error('Function did not become healthy. Check logs in the Supabase dashboard → Edge Functions → api.');
console.log(`   ${base}/health OK`);

console.log('5/5 Data…');
const [{ n }] = await sqlQuery('select count(*)::int as n from tenant');
if (n > 0) console.log('   database already has data — not importing.');
else {
  const file = here('./data/export.sql');
  if (!existsSync(file)) throw new Error('No api/data/export.sql. Run: npm run export:sql -w api');
  await sqlQuery(readFileSync(file, 'utf8'));
  const [c] = await sqlQuery('select (select count(*)::int from submission) as responses, (select count(*)::int from form_version) as versions');
  console.log(`   imported ${c.responses} responses, ${c.versions} versions`);
}
console.log(`\nAPI live at ${base}`);
