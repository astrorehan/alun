// Uji alur, ekonomi, pencemaran dan simpanan ALUN tanpa browser. Jalankan: npm run uji
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = fileURLToPath(new URL('.', import.meta.url));
const entry = process.argv[2] ?? 'uji.ts';
const out = mkdtempSync(join(tmpdir(), 'alun-uji-'));
try {
  const file = join(out, 'uji.mjs');
  await build({
    entryPoints: [join(here, entry)],
    outfile: file,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'es2022',
    logLevel: 'error',
  });
  await import(pathToFileURL(file).href);
} finally {
  rmSync(out, { recursive: true, force: true });
}
