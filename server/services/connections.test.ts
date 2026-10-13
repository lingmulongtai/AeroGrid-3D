import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { createAtlasDataService } from './atlasData';
import { Connections, validatePreferences } from './connections';

describe('private provider connections', () => {
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
