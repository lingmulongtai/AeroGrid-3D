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
});
