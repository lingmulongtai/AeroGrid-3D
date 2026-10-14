import { describe, expect, it, vi } from 'vitest';
import { PublicLayers } from './publicLayers';
const query = { latitude: 60.17, longitude: 24.94, radiusNm: 50 };
describe('shared public data limits', () => {
  it('recovers after backoff even when clients poll more frequently', async () => {
    let now = Date.UTC(2026, 9, 13);
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(Response.json({ features: [] }));
    const data = new PublicLayers(fetchFn, () => now);
    expect((await data.ships(query)).status).toBe('unavailable');
    now += 30_000; await data.ships(query); expect(fetchFn).toHaveBeenCalledTimes(1);
    now += 30_000; expect((await data.ships(query)).status).toBe('available'); expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('filters each ship request by great-circle distance while sharing the full 60-second catalog', async () => {
    let now = Date.UTC(2026, 9, 15);
    const features = [
      { geometry: { coordinates: [24.94, 60.17] }, properties: { mmsi: 1, timestampExternal: now, heading: 0, sog: 0 } },
      { geometry: { coordinates: [22.27, 60.45] }, properties: { mmsi: 2, timestampExternal: now, heading: 0, sog: 0 } },
    ];
    const fetch = vi.fn(async () => Response.json({ features }));
    const data = new PublicLayers(fetch, () => now);
    const helsinki = await data.ships(query);
    expect(helsinki.items.map((ship) => ship.id)).toEqual(['1']);
    expect(helsinki.coverage).toEqual({ kind: 'radius', center: { latitude: query.latitude, longitude: query.longitude }, radiusNm: 50 });
    expect(helsinki.message).toContain('Baltic receiver coverage');
    const turku = await data.ships({ ...query, latitude: 60.45, longitude: 22.27 });
    expect(turku.items.map((ship) => ship.id)).toEqual(['2']);
    expect(fetch).toHaveBeenCalledTimes(1);
    now += 59_000; await data.ships(query); expect(fetch).toHaveBeenCalledTimes(1);
    now += 1_000; await data.ships(query); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('returns requested empty coverage outside Finland without invoking either provider', async () => {
    const fetch = vi.fn();
    const data = new PublicLayers(fetch);
    const tokyo = { latitude: 35.68, longitude: 139.76, radiusNm: 250 };
    for (const result of [await data.ships(tokyo), await data.cameras(tokyo)]) {
      expect(result).toMatchObject({ status: 'available', reason: 'outside-coverage', items: [], coverage: { kind: 'radius', center: { latitude: 35.68, longitude: 139.76 }, radiusNm: 250 } });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('filters camera catalogs by radius and reuses the shared upstream catalog', async () => {
    const fetch = vi.fn(async () => Response.json({ features: [
      { geometry: { coordinates: [24.94, 60.17] }, properties: { id: 'Helsinki', presets: [{ id: 'C1234567' }] } },
      { geometry: { coordinates: [25.47, 65.01] }, properties: { id: 'Oulu', presets: [{ id: 'C7654321' }] } },
    ] }));
    const data = new PublicLayers(fetch);
    expect((await data.cameras(query)).items.map((camera) => camera.id)).toEqual(['Helsinki']);
    expect((await data.cameras({ ...query, latitude: 65.01, longitude: 25.47 })).items.map((camera) => camera.id)).toEqual(['Oulu']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
