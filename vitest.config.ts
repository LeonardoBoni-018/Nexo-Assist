import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  // PGlite (Postgres em WASM) leva alguns segundos para iniciar em cada arquivo de teste.
  test: { environment: 'node', include: ['tests/**/*.test.ts'], hookTimeout: 60_000, testTimeout: 30_000 },
});
