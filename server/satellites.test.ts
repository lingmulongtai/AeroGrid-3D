// @vitest-environment node
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as satelliteJs from 'satellite.js';
import { createApp } from './app';
import { SatellitePayload } from './services/satellitePayload';
import type { AtlasDataService } from './services/atlasData';
import type { PublicLayers } from './services/publicLayers';
import type { DataSnapshot } from '../shared/contracts';
import { ORBITAL_ELEMENT_FIELDS, satelliteCategory, type OrbitalElements } from '../shared/live';
import { syntheticElements, FIXTURE_EPOCH } from '../bench/fixtures';

vi.mock('satellite.js', async (importOriginal) => {
  const original = await importOriginal<typeof satelliteJs>();
  return { ...original, json2satrec: vi.fn(original.json2satrec) };
});

const elements = syntheticElements(6000).map((element, index) => ({ ...element,
  NORAD_CAT_ID: index === 0 ? 25544 : index === 1 ? 48274 : element.NORAD_CAT_ID,
  OBJECT_NAME: index < 2 ? 'STATION' : index < 4500 ? `STARLINK-${index}` : index < 4800 ? `IRIDIUM ${index}` : index < 5000 ? `GPS ${index}` : element.OBJECT_NAME,
  CLASSIFICATION_TYPE: 'U', EPHEMERIS_TYPE: 0, REV_AT_EPOCH: index,
}));
const snapshot = (): DataSnapshot<OrbitalElements> => ({ mode: 'live-beta', source: 'celestrak', status: 'available',
  generatedAt: new Date(FIXTURE_EPOCH).toISOString(), expiresAt: new Date(FIXTURE_EPOCH + 7_200_000).toISOString(), coverage: { kind: 'global' }, items: elements });
function setup() {
  vi.spyOn(Date, 'now').mockReturnValue(FIXTURE_EPOCH);
  const getSnapshot = vi.fn().mockResolvedValue(snapshot());
  const app = createApp({ dataService: {} as AtlasDataService, publicLayers: { orbits: { getSnapshot } } as unknown as PublicLayers });
  return { app, getSnapshot };
}
afterEach(() => { vi.restoreAllMocks(); });

describe('satellite payload API', () => {
  it('validates exact integer limits, including boundaries, and defaults to 1200', async () => {
    const { app, getSnapshot } = setup();
    for (const query of ['limit=0', 'limit=5001', 'limit=-1', 'limit=1.5', 'limit=1e3', 'limit=1foo', 'limit=', 'limit=NaN', 'limit=1&limit=2', 'limit[x]=1', 'limit=%20', 'limit=Infinity']) {
      await request(app).get(`/api/v1/satellites?${query}`).expect(400);
    }
    expect(getSnapshot).not.toHaveBeenCalled();
    for (const [query, count] of [['', 1200], ['?limit=1', 1], ['?limit=5000', 5000]] as const) {
      const response = await request(app).get(`/api/v1/satellites${query}`).expect(200);
      expect(response.body.items).toHaveLength(count);
    }
  });

  it('serves prefix-stable, diverse limits with only required fields and stations first', async () => {
    const { app } = setup();
    const all = (await request(app).get('/api/v1/satellites?limit=4200')).body.items;
    for (const limit of [300, 1200, 2400]) {
      const response = await request(app).get(`/api/v1/satellites?limit=${limit}`).expect(200);
      expect(response.body.items).toEqual(all.slice(0, limit));
      expect(response.body.items.slice(0, 2).map((element: OrbitalElements) => element.NORAD_CAT_ID)).toEqual([25544, 48274]);
      expect(new Set(response.body.items.map(satelliteCategory)).size).toBe(6);
      for (const element of response.body.items) expect(Object.keys(element)).toEqual(ORBITAL_ELEMENT_FIELDS);
    }
  });

  it('uses strong encoding-specific ETags and returns bodyless 304 for matching validators', async () => {
    const { app, getSnapshot } = setup();
    const response = await request(app).get('/api/v1/satellites?limit=300').set('Accept-Encoding', 'identity').expect(200);
    expect(response.headers.etag).toMatch(/^"sat-[^"]+"$/);
    expect(response.headers['cache-control']).toBe('public, max-age=600');
    const unchanged = await request(app).get('/api/v1/satellites?limit=300').set('Accept-Encoding', 'identity').set('If-None-Match', response.headers.etag).expect(304);
    expect(unchanged.text).toBe('');
    expect(unchanged.headers.etag).toBe(response.headers.etag);
    expect(unchanged.headers.vary).toContain('Accept-Encoding');
    await request(app).get('/api/v1/satellites?limit=301').set('If-None-Match', response.headers.etag).expect(200);
    const tags = new Set([response.headers.etag]);
    for (const encoding of ['gzip', 'br']) {
      const compressed = await request(app).get('/api/v1/satellites?limit=300').set('Accept-Encoding', encoding).expect(200);
      expect(compressed.headers['content-encoding']).toBe(encoding);
      expect(compressed.body).toEqual(response.body);
      tags.add(compressed.headers.etag);
      await request(app).get('/api/v1/satellites?limit=300').set('Accept-Encoding', encoding).set('If-None-Match', compressed.headers.etag).expect(304);
    }
    expect(tags.size).toBe(3);
    getSnapshot.mockResolvedValue({ ...snapshot(), status: 'stale', message: 'Refresh paused' });
    const stale = await request(app).get('/api/v1/satellites?limit=300').set('Accept-Encoding', 'identity').set('If-None-Match', response.headers.etag).expect(200);
    expect(stale.headers.etag).not.toBe(response.headers.etag);
    expect(stale.body.status).toBe('stale');
    getSnapshot.mockResolvedValue({ ...snapshot(), generatedAt: new Date(FIXTURE_EPOCH + 1).toISOString() });
    const next = await request(app).get('/api/v1/satellites?limit=300').set('Accept-Encoding', 'identity').set('If-None-Match', response.headers.etag).expect(200);
    expect(next.headers.etag).not.toBe(response.headers.etag);
  });

  it('never caches unavailable responses or returns 304 for them', async () => {
    const { app, getSnapshot } = setup();
    const available = await request(app).get('/api/v1/satellites?limit=300').expect(200);
    getSnapshot.mockResolvedValue({ ...snapshot(), status: 'unavailable', items: [], message: 'offline' });
    const response = await request(app).get('/api/v1/satellites?limit=300').set('If-None-Match', available.headers.etag).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toBeUndefined();
    expect(response.body.items).toEqual([]);
  });

  it('memoizes selection, serialization and compressed bytes per generation and limit', async () => {
    const source = { getSnapshot: vi.fn().mockImplementation(async () => structuredClone(snapshot())) };
    let clock = FIXTURE_EPOCH + 7_100_000;
    const payload = new SatellitePayload(source, () => clock);
    const initialize = vi.mocked(satelliteJs.json2satrec);
    initialize.mockClear();
    const first = await payload.get(300, 'gzip');
    expect(first.maxAge).toBe(100);
    expect(initialize).toHaveBeenCalledTimes(elements.length);
    initialize.mockClear();
    const stringify = vi.spyOn(JSON, 'stringify');
    const again = await payload.get(300, 'gzip');
    expect(again.body).toBe(first.body);
    expect(stringify.mock.calls.filter(([value]) => value?.items)).toHaveLength(0);
    await payload.get(1200);
    expect(initialize).not.toHaveBeenCalled();
    clock += 101_000;
    expect((await payload.get(300)).maxAge).toBe(0);
    source.getSnapshot.mockResolvedValue({ ...snapshot(), generatedAt: new Date(FIXTURE_EPOCH + 7_200_000).toISOString() });
    expect((await payload.get(300)).etag).not.toBe(first.etag);
    expect(initialize).toHaveBeenCalledTimes(elements.length);
  });
});
