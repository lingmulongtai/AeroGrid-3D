import fs from 'node:fs/promises';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { expect, it } from 'vitest';
import type { DataSnapshot } from '../shared/contracts';
import { satelliteCategory, type OrbitalElements } from '../shared/live';
import { SatellitePayload } from '../server/services/satellitePayload';

it('measures before/after payload bytes using an existing OMM snapshot without network access', async () => {
  const input = process.env.SATELLITE_PAYLOAD_CACHE ?? '.cache/satellite-bench/omm.json';
  const saved = JSON.parse(await fs.readFile(input, 'utf8')) as { fetchedAt: number; elements: OrbitalElements[] };
  if (!saved.elements?.length || !Number.isFinite(saved.fetchedAt)) throw new Error('Use an existing {fetchedAt,elements} cache; this benchmark never downloads CelesTrak.');
  const snapshot: DataSnapshot<OrbitalElements> = { mode: 'live-beta', source: 'celestrak', status: 'available',
    generatedAt: new Date(saved.fetchedAt).toISOString(), expiresAt: new Date(saved.fetchedAt + 7_200_000).toISOString(), coverage: { kind: 'global' }, items: saved.elements };
  const original = Buffer.from(JSON.stringify(snapshot));
  const before = { count: saved.elements.length, raw: original.length, gzip: gzipSync(original).length,
    brotli: brotliCompressSync(original, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }).length };
  const delivery = new SatellitePayload({ getSnapshot: async () => snapshot }, () => saved.fetchedAt);
  const rows = [];
  for (const requested of [300, 1200, 2400, 4200, undefined]) {
    const limit = requested ?? 1200;
    const raw = await delivery.get(limit);
    const gzip = await delivery.get(limit, 'gzip');
    const brotli = await delivery.get(limit, 'br');
    const items = (JSON.parse(raw.body.toString()) as DataSnapshot<OrbitalElements>).items;
    expect(items).toHaveLength(limit);
    const categories: Record<string, number> = {};
    for (const item of items) { const category = satelliteCategory(item); categories[category] = (categories[category] ?? 0) + 1; }
    rows.push({ limit: requested ?? 'default', before, after: { count: items.length, raw: raw.body.length, gzip: gzip.body.length, brotli: brotli.body.length }, categories });
  }
  const results = { input, generatedAt: snapshot.generatedAt, measuredAt: new Date().toISOString(), node: process.version,
    note: 'CelesTrak active local snapshot, no network; gzip level 6 / Brotli quality 4. Before compression sizes are hypothetical (baseline sent identity only).', rows };
  await fs.mkdir('.cache/satellite-payload', { recursive: true });
  await fs.writeFile('.cache/satellite-payload/results.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
});
