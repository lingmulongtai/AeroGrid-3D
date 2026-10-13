import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { OrbitProvider } from './orbits';
const now = Date.UTC(2026, 9, 13, 6);
const omm = { OBJECT_NAME: 'ISS', OBJECT_ID: '1998-067A', ELEMENT_SET_NO: 999, NORAD_CAT_ID: 25544, EPOCH: '2026-10-13T00:00:00', MEAN_MOTION: 15.5, ECCENTRICITY: 0.0003, INCLINATION: 51.64, RA_OF_ASC_NODE: 32, ARG_OF_PERICENTER: 10, MEAN_ANOMALY: 50, BSTAR: 0.0001, MEAN_MOTION_DOT: 0.0001, MEAN_MOTION_DDOT: 0 };
describe('persistent orbital elements', () => {
  it('persists the orbital refresh interval and stops on provider failure across restarts', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'aerogrid-orbit-'));
    const cachePath = path.join(dir, 'orbits.json');
    let clock = now;
    const fetchFn = vi.fn().mockResolvedValueOnce(Response.json([omm])).mockResolvedValueOnce(new Response('', { status: 403 }));
    try {
      const provider = new OrbitProvider(cachePath, fetchFn, () => clock);
      expect((await provider.getSnapshot()).status).toBe('available');
      await new OrbitProvider(cachePath, fetchFn, () => clock).getSnapshot();
      expect(fetchFn).toHaveBeenCalledTimes(1);
      clock += 2 * 60 * 60_000;
      expect((await provider.getSnapshot()).status).toBe('stale');
      clock += 2 * 60 * 60_000;
      expect((await new OrbitProvider(cachePath, fetchFn, () => clock).getSnapshot()).status).toBe('stale');
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(JSON.parse(await readFile(cachePath, 'utf8')).blocked).toContain('HTTP 403');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
