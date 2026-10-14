import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Keep the comparison reproducible without maintaining a second renderer fork.
const base = '643e0e375cf7bb834458b0da7410fd674ad04daa';
const root = fileURLToPath(new URL('../', import.meta.url));
const cache = new URL('../.cache/satellite-bench/', import.meta.url);
mkdirSync(cache, { recursive: true });
const oldData = execFileSync('git', ['show', `${base}:src/data/satellites.ts`], { cwd: root, encoding: 'utf8' })
  .replace("'../globe/astro'", "'../../src/globe/astro'");
const oldLayer = execFileSync('git', ['show', `${base}:src/globe/layers/satellites.ts`], { cwd: root, encoding: 'utf8' })
  .replace("'../../data/satellites'", "'./baseline-data'")
  .replace("'../geo'", "'../../src/globe/geo'")
  .replace("'../materials'", "'../../src/globe/materials'")
  .replace("'../models'", "'../../src/globe/models'");
writeFileSync(new URL('baseline-data.ts', cache), oldData);
writeFileSync(new URL('baseline-layer.ts', cache), oldLayer);

export default defineConfig({ test: { environment: 'node', include: ['bench/satellites.bench.ts'], fileParallelism: false, testTimeout: 600_000 } });
