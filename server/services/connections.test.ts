import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { createAtlasDataService } from './atlasData';
import { Connections, validatePreferences } from './connections';
import { AirplanesLiveProvider } from '../providers/airplanesLive';
import { ProviderError } from '../providers/errors';
import { TestBudgetStore } from '../../tests/fixtures/flightBudgetStore';
import { PersistentFlightBudget } from '../lib/flightBudget';
import type { FlightBudgetSource } from '../lib/flightBudgetConfig';

describe('private provider connections', () => {
  it('shares paid cooldown across independent connection managers without sharing keys or provider pools', async () => {
    const stores = new Map<FlightBudgetSource, TestBudgetStore>();
    const budgets = (source: FlightBudgetSource) => {
      if (!stores.has(source)) stores.set(source, new TestBudgetStore());
      return new PersistentFlightBudget(stores.get(source)!, false);
    };
    const upstream = vi.spyOn(AirplanesLiveProvider.prototype, 'fetchFlights')
      .mockRejectedValueOnce(new ProviderError('rate limited', 429, 3600))
      .mockImplementation(async () => ({ items: [], generatedAtMs: Date.now() }));
    const a = new Connections(createAtlasDataService(), budgets);
    const b = new Connections(createAtlasDataService(), budgets);
    try {
      const first = a.create({ flightSource: 'adsbexchange', shipSource: 'fintraffic', rapidApiKey: 'first-private-key' });
      await a.get(first.token)!.flights.getFlights({ latitude: 35, longitude: 140, radiusNm: 150 });
      a.remove(first.token);
      const next = b.create({ flightSource: 'adsbexchange', shipSource: 'fintraffic', rapidApiKey: 'another-private-key' });
      expect((await b.get(next.token)!.flights.getFlights({ latitude: 60, longitude: 25, radiusNm: 100 })).status).toBe('rate-limited');
      expect(upstream).toHaveBeenCalledTimes(1);
      const legacy = b.create({ flightSource: 'airplanes.live', shipSource: 'fintraffic' });
      expect((await b.get(legacy.token)!.flights.getFlights({ latitude: 60, longitude: 25, radiusNm: 100 })).status).toBe('available');
      expect(upstream).toHaveBeenCalledTimes(2);
      const persisted = [...stores.values()].map((store) => store.contents).join('');
      for (const secret of ['first-private-key', 'another-private-key', first.token, next.token]) expect(persisted).not.toContain(secret);
    } finally { a.close(); b.close(); upstream.mockRestore(); }
  });
  it('preserves paid provider cooldown when a client reconnects', async () => {
    const upstream = vi.spyOn(AirplanesLiveProvider.prototype, 'fetchFlights').mockRejectedValue(new ProviderError('rate limited', 429, 3600));
    const connections = new Connections();
    try {
      const preferences = { flightSource: 'adsbexchange' as const, shipSource: 'fintraffic' as const, rapidApiKey: 'private-key' };
      const a = connections.create(preferences);
      await connections.get(a.token)!.flights.getFlights({ latitude: 35, longitude: 140, radiusNm: 150 });
      connections.remove(a.token);
      const b = connections.create({ ...preferences, rapidApiKey: 'private-key' });
      expect((await connections.get(b.token)!.flights.getFlights({ latitude: 35, longitude: 140, radiusNm: 150 })).status).toBe('rate-limited');
      expect(upstream).toHaveBeenCalledTimes(1);
    } finally { connections.close(); upstream.mockRestore(); }
  });
  it('shares the free provider cache and budget across sessions', () => {
    const free = createAtlasDataService();
    const connections = new Connections(free);
    const a = connections.create({ flightSource: 'adsb.lol', shipSource: 'fintraffic' });
    const b = connections.create({ flightSource: 'adsb.lol', shipSource: 'fintraffic' });
    expect(connections.get(a.token)?.flights).toBe(free);
    expect(connections.get(b.token)?.flights).toBe(free);
    connections.close();
  });
  it('requires credentials for keyed providers and rejects header injection', () => {
    expect(validatePreferences({ flightSource: 'adsbexchange', shipSource: 'fintraffic' })).toBeNull();
    expect(validatePreferences({ flightSource: 'adsb.lol', shipSource: 'aisstream' })).toBeNull();
    expect(validatePreferences({ flightSource: 'adsbexchange', shipSource: 'fintraffic', rapidApiKey: 'key\r\nHeader:value' })).toBeNull();
  });
  it('isolates connection tokens and expires credentials without reflecting keys', async () => {
    const connections = new Connections();
    const app = createApp({ dataService: createAtlasDataService(), connections });
    const body = { flightSource: 'adsbexchange', shipSource: 'fintraffic', rapidApiKey: 'test-secret' };
    const first = await request(app).post('/api/v1/connections').send(body).expect(200);
    const second = await request(app).post('/api/v1/connections').send(body).expect(200);
    expect(JSON.stringify(first.body)).not.toContain('test-secret');
    expect(first.body.token).not.toBe(second.body.token);
    await request(app).get('/api/v1/flights?lat=35&lon=140&radius_nm=150').set('Authorization', 'Bearer invalid').expect(401);
    await request(app).delete('/api/v1/connections').set('Authorization', `Bearer ${first.body.token}`).expect(204);
    expect(connections.get(first.body.token)).toBeUndefined();
    expect(connections.get(second.body.token)).toBeDefined();
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 61 * 60_000);
    expect(connections.get(second.body.token)).toBeUndefined();
    vi.useRealTimers(); connections.close();
  });
  it('rejects cross-origin and malformed origins for credential writes', async () => {
    const connections = new Connections();
    const app = createApp({ dataService: createAtlasDataService(), connections });
    await request(app).post('/api/v1/connections').set('Origin', 'https://attacker.example').send({ flightSource: 'adsb.lol', shipSource: 'fintraffic' }).expect(403);
    await request(app).post('/api/v1/connections').set('Origin', 'not-a-url').send({ flightSource: 'adsb.lol', shipSource: 'fintraffic' }).expect(403);
    connections.close();
  });
});
