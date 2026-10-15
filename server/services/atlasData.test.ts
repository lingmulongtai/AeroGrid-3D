import { describe, expect, it, vi } from 'vitest';
import type { FlightRecord } from '../../shared/contracts';
import { LIVE_FLIGHT_REFRESH_MS } from '../../shared/contracts';
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
  it.each(['success', 'failure'] as const)('keeps the new UTC budget when yesterday\'s request finishes with %s', async (outcome) => {
    const midnight = Date.UTC(2026, 9, 16);
    let now = midnight - 1;
    let resolve!: (value: { items: FlightRecord[]; generatedAtMs: number }) => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<{ items: FlightRecord[]; generatedAtMs: number }>((yes, no) => { resolve = yes; reject = no; });
    const fetchFlights = vi.fn().mockReturnValueOnce(pending).mockImplementation(async () => ({ items: [flight], generatedAtMs: now }));
    const quota = new DailyQuota(450);
    const service = createAtlasDataService({ flightProvider: { fetchFlights }, quota, now: () => now });
    const oldRequest = service.getFlights(query);
    now = midnight;
    await service.getFlights({ ...query, latitude: 50 });
    if (outcome === 'success') resolve({ items: [flight], generatedAtMs: midnight - 1 });
    else reject(new ProviderError('offline', 503));
    await oldRequest;
    expect(quota.getState(now)).toMatchObject({ day: '2026-10-16', count: 1 });
    expect((await service.getFlights({ ...query, latitude: 40 })).reason).toBe('budget-paced');
    expect(fetchFlights).toHaveBeenCalledTimes(2);
  });

  it.each([
    [60_000, 'available'], [60_001, 'stale'], [300_000, 'stale'], [300_001, 'unavailable'],
    [-60_000, 'available'], [-60_001, 'unavailable'], [NaN, 'unavailable'],
  ] as const)('validates a new provider observation age of %s ms as %s', async (age, status) => {
    const now = Date.UTC(2026, 9, 15);
    const service = createAtlasDataService({ flightProvider: { fetchFlights: vi.fn(async () => ({ items: [flight], generatedAtMs: now - age })) }, now: () => now });
    const result = await service.getFlights(query);
    expect(result.status).toBe(status);
    expect(result.items).toEqual(status === 'unavailable' ? [] : [flight]);
    expect(service.getStatus().sources.flights.status).toBe(status);
  });

  it('keeps a full UTC day of rotating areas and shared sessions below 450 upstream calls', async () => {
    const start = Date.UTC(2026, 9, 15);
    let now = start;
    const quota = new DailyQuota(450);
    const fetchFlights = vi.fn(async () => ({ items: [flight], generatedAtMs: now }));
    const services = [0, 1].map(() => createAtlasDataService({ flightProvider: { fetchFlights }, quota, now: () => now }));
    const statuses = new Set<string>();
    // Requests every 10 seconds hit the exact 210-second slots. Two separate
    // caches share one budget, as paid sessions do; new areas cannot bypass it.
    for (let elapsed = 0; elapsed < 86_400_000; elapsed += 10_000) {
      now = start + elapsed;
      const area = { ...query, latitude: (elapsed / 10_000 % 1700) / 10 - 85 };
      for (const service of services) statuses.add((await service.getFlights(area)).status);
    }
    expect(fetchFlights).toHaveBeenCalledTimes(412);
    expect(quota.getState(now)).toMatchObject({ count: 412, limit: 450 });
    expect(statuses.has('rate-limited')).toBe(false);
  });

  it('never retains aircraft beyond five minutes from generatedAt with the longer cache', async () => {
    let now = Date.UTC(2026, 9, 15);
    const start = now;
    const fetchFlights = vi.fn().mockResolvedValueOnce({ items: [flight], generatedAtMs: now }).mockRejectedValue(new ProviderError('offline', 503));
    const service = createAtlasDataService({ flightProvider: { fetchFlights }, now: () => now });
    await service.getFlights(query);
    now = start + LIVE_FLIGHT_REFRESH_MS;
    expect((await service.getFlights(query)).items).toEqual([flight]);
    now = start + 300_000;
    expect((await service.getFlights(query)).items).toEqual([flight]);
    now++;
    expect((await service.getFlights(query)).items).toEqual([]);
    expect(fetchFlights).toHaveBeenCalledTimes(2);
  });

  it('honors a provider Retry-After longer than the normal cadence without extra quota charges', async () => {
    let now = Date.UTC(2026, 9, 15);
    const start = now;
    const quota = new DailyQuota(450);
    const fetchFlights = vi.fn().mockRejectedValue(new ProviderError('rate limited', 429, 3600));
    const service = createAtlasDataService({ flightProvider: { fetchFlights }, quota, now: () => now });
    const first = await service.getFlights(query);
    expect(first.nextRefreshAt).toBe(new Date(start + 3_600_000).toISOString());
    now += LIVE_FLIGHT_REFRESH_MS;
    const blocked = await service.getFlights({ ...query, latitude: 50 });
    expect(blocked).toMatchObject({ status: 'rate-limited', retryAfterSeconds: 3390, nextRefreshAt: first.nextRefreshAt });
    expect(quota.getState(now).count).toBe(1);
    expect(fetchFlights).toHaveBeenCalledTimes(1);
    now = start + 3_600_000;
    await service.getFlights(query);
    expect(fetchFlights).toHaveBeenCalledTimes(2);
  });

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
    now += LIVE_FLIGHT_REFRESH_MS;
    await service.getFlights(query);
    expect(fetchFlights).toHaveBeenCalledTimes(2);
    expect(quota.getState(now).count).toBe(2);
    const paced = await service.getFlights({ latitude: -35.681, longitude: -139.761, radiusNm: 1 });
    expect(paced).toMatchObject({ reason: 'budget-paced', items: [], retryAfterSeconds: 210 });
    expect(quota.getState(now).count).toBe(2);
    now += LIVE_FLIGHT_REFRESH_MS;
    await service.getFlights({ latitude: -35.681, longitude: -139.761, radiusNm: 1 });
    expect(fetchFlights).toHaveBeenLastCalledWith(-35.7, -139.8, 5);
    expect(quota.getState(now).count).toBe(3);
  });
  it('shares a flight snapshot until the next budget slot and reports its true age', async () => {
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
    now += 60_000;
    expect((await service.getFlights(query)).status).toBe('stale');
    expect(fetchFlights).toHaveBeenCalledTimes(1);
    now += 91_000; // Exactly 210s: expiry releases the next upstream slot.
    expect((await service.getFlights(query)).status).toBe('available');
    expect(fetchFlights).toHaveBeenCalledTimes(2);
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
    now += LIVE_FLIGHT_REFRESH_MS;
    const stale = await service.getFlights(query);
    expect(stale.status).toBe('stale');
    expect(stale.source).toBe('airplanes.live');
    expect(stale.items).toEqual([flight]);
    expect(fetchFlights).toHaveBeenCalledTimes(2);
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
