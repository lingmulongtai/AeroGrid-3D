import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { TestBudgetStore } from '../../tests/fixtures/flightBudgetStore';
import { createApp } from '../app';
import { PersistentFlightBudget } from '../lib/flightBudget';
import { ProviderError } from '../providers/errors';
import { createAtlasDataService } from './atlasData';

const query = { latitude: 35, longitude: 140, radiusNm: 150 };
const start = Date.UTC(2026, 9, 15);
function fixture() {
  let now = start;
  const store = new TestBudgetStore();
  const fetchFlights = vi.fn(async () => ({ items: [], generatedAtMs: now }));
  const service = () => createAtlasDataService({ now: () => now, budget: new PersistentFlightBudget(store, false), flightProvider: { fetchFlights } });
  return { store, fetchFlights, service, advance: (ms: number) => { now += ms; } };
}
describe('durable aircraft admission through independent services', () => {
  it('charges one upstream request across regions/areas and keeps pacing after recreation', async () => {
    const f = fixture();
    const a = f.service(), b = f.service();
    const results = await Promise.all([a.getFlights(query), b.getFlights({ ...query, latitude: 60 })]);
    expect(f.fetchFlights).toHaveBeenCalledTimes(1);
    expect(results.filter((snapshot) => snapshot.reason === 'budget-paced')).toHaveLength(1);
    expect(b.getStatus().sources.flights.requestCount).toBe(1);
    f.advance(209_999);
    expect((await f.service().getFlights(query)).reason).toBe('budget-paced');
    f.advance(1);
    await f.service().getFlights(query);
    expect(f.fetchFlights).toHaveBeenCalledTimes(2);
    expect(JSON.parse(f.store.contents!).count).toBe(2);
  });
  it.each([3600, undefined])('persists HTTP 429 cooldown (%s) across restart and exposes it through HTTP', async (retryAfter) => {
    const f = fixture();
    f.fetchFlights.mockRejectedValueOnce(new ProviderError('rate limited', 429, retryAfter));
    await f.service().getFlights(query);
    f.advance(210_000);
    const service = f.service();
    const response = await request(createApp({ dataService: service })).get('/api/v1/flights?lat=60&lon=25&radius_nm=100').expect(429);
    expect(response.body.status).toBe('rate-limited');
    expect(response.body.retryAfterSeconds).toBe((retryAfter ? retryAfter : 86_400) - 210);
    expect(response.body.nextRefreshAfterMs).toBe(response.body.retryAfterSeconds * 1000);
    expect(f.fetchFlights).toHaveBeenCalledTimes(1);
    expect(JSON.parse(f.store.contents!).count).toBe(1);
  });
  it('never calls upstream on storage failure or an uncertain committed reservation', async () => {
    const f = fixture();
    const write = f.store.compareAndSwap.bind(f.store);
    vi.spyOn(f.store, 'compareAndSwap').mockImplementationOnce(async (...args) => { await write(...args); throw new Error('timeout after commit'); });
    const result = await f.service().getFlights(query);
    expect(result).toMatchObject({ status: 'unavailable', items: [], nextRefreshAfterMs: 60_000 });
    f.advance(400_000);
    await f.service().getFlights(query);
    expect(f.fetchFlights).not.toHaveBeenCalled();
  });
  it('keeps a failed 429 completion latched beyond its normal refresh interval', async () => {
    const f = fixture();
    const write = f.store.compareAndSwap.bind(f.store);
    vi.spyOn(f.store, 'compareAndSwap').mockImplementationOnce(write).mockRejectedValueOnce(new Error('offline'));
    f.fetchFlights.mockRejectedValueOnce(new ProviderError('rate limited', 429, 3600));
    await f.service().getFlights(query);
    f.advance(400_000);
    await f.service().getFlights({ ...query, latitude: 60 });
    expect(f.fetchFlights).toHaveBeenCalledTimes(1);
    expect(JSON.parse(f.store.contents!).pending).not.toBeNull();
  });
  it('serves a fresh local cache without storage, but never retains observations beyond five minutes', async () => {
    const f = fixture();
    const service = f.service();
    const first = await service.getFlights(query);
    const read = vi.spyOn(f.store, 'read').mockRejectedValue(new Error('offline'));
    f.advance(60_001);
    const cached = await service.getFlights(query);
    expect(cached).toMatchObject({ generatedAt: first.generatedAt, status: 'stale' });
    expect(read).not.toHaveBeenCalled();
    f.advance(240_000);
    expect(await service.getFlights(query)).toMatchObject({ status: 'unavailable', items: [] });
    expect(f.fetchFlights).toHaveBeenCalledTimes(1);
  });
  it('charges failed provider attempts once and releases the latch on a non-429 error', async () => {
    const f = fixture();
    f.fetchFlights.mockRejectedValueOnce(new ProviderError('offline', 503));
    await f.service().getFlights(query);
    expect(JSON.parse(f.store.contents!)).toMatchObject({ count: 1, pending: null });
    f.advance(210_000);
    await f.service().getFlights(query);
    expect(f.fetchFlights).toHaveBeenCalledTimes(2);
  });
});
