import { describe, expect, it, vi } from 'vitest';
import { AirplanesLiveProvider, normalizeAirplanesLiveAircraft } from './airplanesLive';
import { ProviderError } from './errors';

describe('normalizeAirplanesLiveAircraft', () => {
  it('normalizes provider units into AeroGrid units', () => {
    const flight = normalizeAirplanesLiveAircraft({
      hex: 'abc123',
      flight: ' JAL42 ',
      r: 'JA123A',
      t: 'B789',
      lat: 35.6,
      lon: 139.7,
      alt_baro: 30_000,
      gs: 480,
      track: 92,
      baro_rate: 1_000,
      category: 'A5',
      seen: 0.4,
    });

    expect(flight).toMatchObject({
      id: 'abc123',
      callsign: 'JAL42',
      registration: 'JA123A',
      aircraftType: 'B789',
      altitude: 9_144,
      heading: 92,
      category: 'heavy',
    });
    expect(flight?.velocity).toBeCloseTo(246.93, 1);
    expect(flight?.verticalRate).toBeCloseTo(5.08, 2);
  });

  it('drops aircraft without a stable id or position', () => {
    expect(normalizeAirplanesLiveAircraft({ hex: 'abc123' })).toBeNull();
  });
});

describe('AirplanesLiveProvider', () => {
  it('surfaces provider rate-limit metadata', async () => {
    const fetchFn = vi.fn(async () => new Response('', {
      status: 429,
      headers: { 'retry-after': '120' },
    }));
    const provider = new AirplanesLiveProvider(fetchFn as typeof fetch);

    await expect(provider.fetchFlights(35.6, 139.7, 100)).rejects.toEqual(
      expect.objectContaining<Partial<ProviderError>>({ statusCode: 429, retryAfterSeconds: 120 }),
    );
  });
});
