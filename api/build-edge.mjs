// Bundles the API (src/edge.ts + shared packages + npm deps) into one ESM file that Supabase
// Edge Functions (Deno) can run: supabase/functions/api/index.js
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';
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
  // Supabase's runtime does not define Node globals (Buffer, process, setImmediate) — provide them.
  banner: {
    js: [
      "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
      "import { Buffer as __Buffer } from 'node:buffer'; import __process from 'node:process'; import { setImmediate as __si, clearImmediate as __ci } from 'node:timers';",
      'globalThis.Buffer ??= __Buffer; globalThis.process ??= __process; globalThis.setImmediate ??= __si; globalThis.clearImmediate ??= __ci; globalThis.global ??= globalThis;',
    ].join('\n'),
  },
  // Supabase's Deno bundler rejects bare built-ins ("fs"); force the "node:" prefix.
  plugins: [
    {
      name: 'node-prefix',
      setup(b) {
        const builtins = new Set(builtinModules);
        b.onResolve({ filter: /^[a-z_/]+$/ }, (args) => {
          const base = args.path.split('/')[0];
          return builtins.has(args.path) || builtins.has(base) ? { path: `node:${args.path}`, external: true } : undefined;
        });
      },
    },
  ],
  legalComments: 'none',
  logLevel: 'warning',
});
console.log('built supabase/functions/api/index.js');
