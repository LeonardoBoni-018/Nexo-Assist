// Build do serviço de chamados para a Vercel usando a Build Output API:
// empacota tudo (inclusive src/domain e src/db) em uma única função Node.
import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, '.vercel/output');
const fn = path.join(out, 'functions/index.func');
rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

await build({
  entryPoints: [path.join(here, 'src/vercel.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: path.join(fn, 'index.mjs'),
  // Só usado sem TICKETS_DATABASE_URL (desenvolvimento local).
  external: ['@electric-sql/pglite'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});

writeFileSync(
  path.join(fn, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, supportsResponseStreaming: true }),
);
writeFileSync(path.join(out, 'config.json'), JSON.stringify({ version: 3, routes: [{ src: '/(.*)', dest: '/index' }] }));
console.log('[tickets] build pronto em', out);
