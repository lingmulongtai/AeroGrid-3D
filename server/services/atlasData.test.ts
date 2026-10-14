import { describe, expect, it, vi } from 'vitest';
import type { FlightRecord } from '../../shared/contracts';
import { DailyQuota } from '../lib/quota';
import { ProviderError } from '../providers/errors';
import { createAtlasDataService } from './atlasData';

const query = { latitude: 35.68, longitude: 139.76, radiusNm: 150 };
const flight: FlightRecord = {
  id: 'abc123', callsign: 'JAL42', longitude: 139.7, latitude: 35.6,
  altitude: 9_000, velocity: 240, heading: 90, verticalRate: 0,
  onGround: false, category: 'heavy', lastSeenSeconds: 0.4,
  positionHistory: [[139.7, 35.6, 9_000]],
};

describe('AtlasDataService', () => {
  it('shares normalized nearby requests, upstream coordinates and one quota charge', async () => {
    let now = Date.UTC(2026, 9, 15);
    const fetchFlights = vi.fn(async () => ({ items: [flight], generatedAtMs: now }));
    const quota = new DailyQuota(450);
    const service = createAtlasDataService({ flightProvider: { fetchFlights }, weatherProvider: { fetchWeather: vi.fn() }, quota, now: () => now });
    const first = await service.getFlights({ latitude: 35.681, longitude: 139.761, radiusNm: 147 });
    const second = await service.getFlights({ latitude: 35.719, longitude: 139.799, radiusNm: 149.9 });
    expect(second).toBe(first);
    expect(first.coverage).toEqual({ kind: 'radius', center: { latitude: 35.7, longitude: 139.8 }, radiusNm: 150 });
    expect(fetchFlights).toHaveBeenCalledExactlyOnceWith(35.7, 139.8, 150);
    expect(quota.getState(now).count).toBe(1);
    now += 60_001;
    await service.getFlights(query);
    expect(fetchFlights).toHaveBeenCalledTimes(2);
    expect(quota.getState(now).count).toBe(2);
    await service.getFlights({ latitude: -35.681, longitude: -139.761, radiusNm: 1 });
    expect(fetchFlights).toHaveBeenLastCalledWith(-35.7, -139.8, 5);
    expect(quota.getState(now).count).toBe(3);
  });
  it('shares a flight snapshot for sixty seconds', async () => {
    let now = Date.UTC(2026, 6, 16, 0, 0, 0);
    const fetchFlights = vi.fn(async () => ({ items: [flight], generatedAtMs: now }));
    const service = createAtlasDataService({
      flightProvider: { fetchFlights },
      weatherProvider: { fetchWeather: vi.fn() },
      now: () => now,
    });

    await expect(service.getFlights(query)).resolves.toMatchObject({
      mode: 'live-beta', source: 'airplanes.live', status: 'available', items: [flight],
    });
    now += 59_000;
    await service.getFlights(query);
    expect(fetchFlights).toHaveBeenCalledTimes(1);
  });

  it('keeps the last good snapshot stale for five minutes and never inserts demo data', async () => {
    let now = Date.UTC(2026, 6, 16, 0, 0, 0);
    const fetchFlights = vi.fn()
      .mockResolvedValueOnce({ items: [flight], generatedAtMs: now })
      .mockRejectedValueOnce(new ProviderError('upstream unavailable', 503));
    const service = createAtlasDataService({
      flightProvider: { fetchFlights },
      weatherProvider: { fetchWeather: vi.fn() },
      now: () => now,
    });

    await service.getFlights(query);
    now += 61_000;
    const stale = await service.getFlights(query);
    expect(stale.status).toBe('stale');
    expect(stale.source).toBe('airplanes.live');
    expect(stale.items).toEqual([flight]);
  });

  it('returns an empty rate-limited snapshot when the soft quota is exhausted', async () => {
    const now = Date.UTC(2026, 6, 16, 0, 0, 0);
    const quota = new DailyQuota(0);
    const service = createAtlasDataService({
      flightProvider: { fetchFlights: vi.fn() },
      weatherProvider: { fetchWeather: vi.fn() },
      quota,
      now: () => now,
    });

    await expect(service.getFlights(query)).resolves.toMatchObject({
      mode: 'live-beta', source: 'airplanes.live', status: 'rate-limited', items: [],
    });
  });

  it('deduplicates concurrent requests for the same coverage area', async () => {
    let resolveProvider!: (value: { items: FlightRecord[]; generatedAtMs: number }) => void;
    const providerResult = new Promise<{ items: FlightRecord[]; generatedAtMs: number }>((resolve) => { resolveProvider = resolve; });
    const fetchFlights = vi.fn(() => providerResult);
    const now = Date.UTC(2026, 6, 16, 0, 0, 0);
    const service = createAtlasDataService({
      flightProvider: { fetchFlights }, weatherProvider: { fetchWeather: vi.fn() }, now: () => now,
    });

    const first = service.getFlights(query);
    const second = service.getFlights(query);
    resolveProvider({ items: [flight], generatedAtMs: now });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetchFlights).toHaveBeenCalledTimes(1);
  });

  it('stops upstream retries after HTTP 429', async () => {
    let now = Date.UTC(2026, 6, 16, 0, 0, 0);
    const fetchFlights = vi.fn().mockRejectedValue(new ProviderError('rate limited', 429, 120));
    const service = createAtlasDataService({
      flightProvider: { fetchFlights }, weatherProvider: { fetchWeather: vi.fn() }, now: () => now,
    });

    await expect(service.getFlights(query)).resolves.toMatchObject({ status: 'rate-limited', retryAfterSeconds: 120 });
    now += 60_000;
    await expect(service.getFlights({ ...query, latitude: 35.7 })).resolves.toMatchObject({ status: 'rate-limited', retryAfterSeconds: 60 });
    expect(fetchFlights).toHaveBeenCalledTimes(1);
  });
});
