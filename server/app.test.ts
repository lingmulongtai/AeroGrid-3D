import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { AtlasStatus, DataSnapshot, FlightRecord, WeatherFrame } from '../shared/contracts';
import type { AtlasDataService } from './services/atlasData';
import { createApp } from './app';

function serviceStub(): AtlasDataService {
  const flights: DataSnapshot<FlightRecord> = {
    mode: 'live-beta', source: 'airplanes.live', status: 'available',
    generatedAt: '2026-07-16T00:00:00.000Z', expiresAt: '2026-07-16T00:01:00.000Z',
    coverage: { kind: 'radius', center: { latitude: 35.68, longitude: 139.76 }, radiusNm: 150 },
    items: [],
  };
  const weather: DataSnapshot<WeatherFrame> = {
    mode: 'live-beta', source: 'rainviewer', status: 'unavailable',
    generatedAt: '2026-07-16T00:00:00.000Z', expiresAt: '2026-07-16T00:00:00.000Z',
    coverage: { kind: 'global' }, items: [], message: 'offline',
  };
  const status: AtlasStatus = {
    service: 'aerogrid-3d', status: 'degraded', time: '2026-07-16T00:00:00.000Z',
    sources: {
      flights: { source: 'airplanes.live', status: 'unavailable', updatedAt: null },
      weather: { source: 'rainviewer', status: 'unavailable', updatedAt: null },
    },
  };
  return {
    getFlights: vi.fn(async () => flights),
    getWeather: vi.fn(async () => weather),
    getStatus: vi.fn(() => status),
  };
}

describe('AeroGrid REST API', () => {
  it('validates the public flight coverage contract', async () => {
    const app = createApp({ dataService: serviceStub() });
    await request(app).get('/api/v1/flights?lat=91&lon=139&radius_nm=150')
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('INVALID_LATITUDE'));
    await request(app).get('/api/v1/flights?lat=35&lon=139&radius_nm=251')
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('INVALID_RADIUS'));
  });

  it('serves a live snapshot and source status', async () => {
    const service = serviceStub();
    const app = createApp({ dataService: service });
    await request(app).get('/api/v1/flights?lat=35.68&lon=139.76&radius_nm=150')
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ mode: 'live-beta', source: 'airplanes.live' }));
    await request(app).get('/api/v1/status').expect(200);
    expect(service.getFlights).toHaveBeenCalledWith({ latitude: 35.68, longitude: 139.76, radiusNm: 150 });
  });
});
