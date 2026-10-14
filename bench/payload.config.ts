import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'node', include: ['bench/payload.bench.ts'], fileParallelism: false, testTimeout: 60_000 } });
