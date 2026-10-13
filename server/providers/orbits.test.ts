import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { OrbitProvider } from './orbits';
import { CacheConflict, type OrbitCacheStore } from './orbitCache';
const now = Date.UTC(2026, 9, 13, 6);
const omm = { OBJECT_NAME: 'ISS', OBJECT_ID: '1998-067A', ELEMENT_SET_NO: 999, NORAD_CAT_ID: 25544, EPOCH: '2026-10-13T00:00:00', MEAN_MOTION: 15.5, ECCENTRICITY: 0.0003, INCLINATION: 51.64, RA_OF_ASC_NODE: 32, ARG_OF_PERICENTER: 10, MEAN_ANOMALY: 50, BSTAR: 0.0001, MEAN_MOTION_DOT: 0.0001, MEAN_MOTION_DDOT: 0 };
describe('persistent orbital elements', () => {
  it('allows only one server to refresh a shared cache and retains the interval across regions', async () => {
    let contents: string | undefined, generation = 0;
    const store: OrbitCacheStore = {
      async read() { return contents === undefined ? null : { contents, version: String(generation) }; },
      async write(value, expected) {
        if (Number(expected ?? 0) !== generation) throw new CacheConflict();
        contents = value; generation++; return String(generation);
      },
    };
    const fetchFn = vi.fn().mockResolvedValue(Response.json([omm]));
    await Promise.all([
      new OrbitProvider('test-cache', fetchFn, () => now, store).getSnapshot(),
      new OrbitProvider('test-cache', fetchFn, () => now, store).getSnapshot(),
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((await new OrbitProvider('test-cache', fetchFn, () => now, store).getSnapshot()).status).toBe('available');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('does not download when persistent storage cannot save the refresh latch', async () => {
    const fetchFn = vi.fn();
    const store: OrbitCacheStore = { async read() { return null; }, async write() { throw new Error('Storage unavailable'); } };
    expect((await new OrbitProvider('test-cache', fetchFn, () => now, store).getSnapshot()).status).toBe('unavailable');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('pauses downloads when an expired stored catalog contains corrupt orbital elements', async () => {
    const fetchFn = vi.fn();
    const store: OrbitCacheStore = {
      async read() { return { contents: JSON.stringify({ fetchedAt: now - 3 * 60 * 60_000, elements: [{}] }), version: '123' }; },
      write: vi.fn(),
    };
    expect((await new OrbitProvider('test-cache', fetchFn, () => now, store).getSnapshot()).status).toBe('unavailable');
    expect(fetchFn).not.toHaveBeenCalled(); expect(store.write).not.toHaveBeenCalled();
  });
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
