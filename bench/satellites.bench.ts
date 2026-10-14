import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { PerspectiveCamera, Vector3 } from 'three';
import { expect, test } from 'vitest';
import { buildConstellation, constellationFromElements } from '../src/data/satellites';
import { SatelliteLayer } from '../src/globe/layers/satellites';
// Generated from immutable main in bench/vitest.config.ts; both old hot paths are preserved.
// @ts-ignore -- ignored local baseline is created before Vitest loads this file.
import * as baselineData from '../.cache/satellite-bench/baseline-data';
// @ts-ignore
import { SatelliteLayer as BaselineLayer } from '../.cache/satellite-bench/baseline-layer';
import { siderealAngle } from '../src/globe/astro';
import { loadCatalog } from './data';

test('satellite frame cost: main vs working tree', async () => {
  const catalog = await loadCatalog();
  const camera = new PerspectiveCamera(38, 16 / 9, 0.001, 4_000_000);
  camera.position.set(0, 0, 6371 + 18_000);
  const origin = new Vector3(0, 0, 6371);
  const pixelsPerRadian = 900 / (2 * Math.tan(38 * Math.PI / 360));
  const rows: Record<string, string | number>[] = [];
  console.log(`DATA: ${catalog.kind}; elements=${catalog.elements.length}; start=${new Date(catalog.time).toISOString()}`);
  const sidereal = siderealAngle(new Date(catalog.time));
  for (const count of [300, 1200, 2400, 4200]) {
    for (const scenario of ['demo trails ON', 'live trails OFF', 'live trails ON']) {
      const durations: number[] = [];
      let deep = 0;
      for (const baseline of [true, false]) {
        const api = baseline ? baselineData : { buildConstellation, constellationFromElements };
        const records = scenario.startsWith('demo') ? api.buildConstellation(count) : api.constellationFromElements(catalog.elements, count, catalog.time);
        expect(records).toHaveLength(count);
        deep = records.filter((record) => record.periodMinutes >= 225).length;
        const layer = baseline ? new BaselineLayer() : new SatelliteLayer();
        layer.setConstellation(records); layer.showTrails = !scenario.endsWith('OFF');
        let frame = 0;
        // Seven seconds includes the bounded progressive history fill, so both
        // renderers are measured with complete trails and the same time window.
        for (; frame < 420; frame++) layer.update(catalog.time + frame * 16, sidereal + frame * 0.016 * 7.2921159e-5, camera, origin, pixelsPerRadian);
        const started = performance.now();
        for (; frame < 480; frame++) layer.update(catalog.time + frame * 16, sidereal + frame * 0.016 * 7.2921159e-5, camera, origin, pixelsPerRadian);
        durations.push((performance.now() - started) / 60);
        layer.dispose();
      }
      rows.push({ count, scenario, deep, beforeMs: +durations[0].toFixed(3), afterMs: +durations[1].toFixed(3), speedup: +(durations[0] / durations[1]).toFixed(2) });
    }
  }
  console.table(rows);
  await writeFile(new URL('../.cache/satellite-bench/results.json', import.meta.url), JSON.stringify({
    baselineCommit: '643e0e375cf7bb834458b0da7410fd674ad04daa', node: process.version,
    warmupFrames: 420, measuredFrames: 60, stepMs: 16, cameraAltitudeKm: 18_000,
    data: catalog.kind, start: catalog.time, rows,
  }, null, 2));
});
