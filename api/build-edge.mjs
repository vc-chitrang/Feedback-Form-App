// Bundles the API (src/edge.ts + shared packages + npm deps) into one ESM file that Supabase
// Edge Functions (Deno) can run: supabase/functions/api/index.js
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

await build({
  entryPoints: [here('./src/edge.ts')],
  outfile: here('../supabase/functions/api/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  // Local-only dependencies (never loaded in the edge function).
  external: ['@electric-sql/pglite', 'pino-pretty'],
  // CommonJS dependencies call require('fs') etc.; give them a real require in ESM.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'warning',
});
console.log('built supabase/functions/api/index.js');
