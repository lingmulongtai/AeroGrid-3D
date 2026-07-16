import request from 'supertest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
    service: 'aerogrid-3d', version: '0.1.0', status: 'degraded', time: '2026-07-16T00:00:00.000Z',
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

  it('emits structured request telemetry when a logger is configured', async () => {
    const logger = vi.fn();
    const app = createApp({ dataService: serviceStub(), logger });

    await request(app).get('/api/v1/status').expect(200);

    expect(logger).toHaveBeenCalledWith(expect.objectContaining({
      level: 'info', event: 'http.request', method: 'GET', path: '/api/v1/status', status: 200,
      requestId: expect.any(String),
    }));
  });

  it('sends security headers and safe production cache policies', async () => {
    const staticDir = await mkdtemp(path.join(tmpdir(), 'aerogrid-static-'));
    await mkdir(path.join(staticDir, 'assets'));
    await writeFile(path.join(staticDir, 'index.html'), '<main>AeroGrid</main>');
    await writeFile(path.join(staticDir, 'assets', 'app-ABC123.js'), 'export {};');

    try {
      const app = createApp({ dataService: serviceStub(), staticDir, logger: vi.fn() });
      const apiResponse = await request(app).get('/api/v1/status').expect(200);
      expect(apiResponse.headers).toMatchObject({
        'cache-control': 'no-store',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
      });
      expect(apiResponse.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(apiResponse.headers['content-security-policy']).toContain("script-src 'self' 'unsafe-eval'");
      expect(apiResponse.headers['content-security-policy']).toContain("worker-src 'self' blob:");
      expect(apiResponse.headers['x-request-id']).toEqual(expect.any(String));

      const assetResponse = await request(app).get('/assets/app-ABC123.js').expect(200);
      expect(assetResponse.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      const documentResponse = await request(app).get('/route').expect(200);
      expect(documentResponse.headers['cache-control']).toBe('no-store');
    } finally {
      await rm(staticDir, { recursive: true, force: true });
    }
  });
});
