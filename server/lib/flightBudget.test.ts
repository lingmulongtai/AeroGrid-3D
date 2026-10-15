import { describe, expect, it, vi } from 'vitest';
import { TestBudgetStore } from '../../tests/fixtures/flightBudgetStore';
import { LIVE_FLIGHT_REFRESH_MS } from '../../shared/contracts';
import { BudgetConflict } from '../providers/flightBudgetStore';
import { PersistentFlightBudget } from './flightBudget';

const start = Date.UTC(2026, 9, 15);
const budget = (store: TestBudgetStore) => new PersistentFlightBudget(store, false);
describe('persistent aircraft budget', () => {
  it('admits exactly one simultaneous request across independent clients', async () => {
    const store = new TestBudgetStore();
    const clients = Array.from({ length: 20 }, () => budget(store));
    const results = await Promise.all(clients.map((client) => client.reserve(start)));
    expect(results.filter((result) => result.allowed)).toHaveLength(1);
    expect(JSON.parse(store.contents!)).toMatchObject({ count: 1, nextRequestAt: start + LIVE_FLIGHT_REFRESH_MS });
  });
  it('keeps pacing, charges and unresolved attempts across restarts', async () => {
    const store = new TestBudgetStore();
    const a = budget(store);
    const first = await a.reserve(start);
    expect((await budget(store).reserve(start + 600_000)).allowed).toBe(false);
    await a.complete(first.reservation!, start + 1);
    const restarted = budget(store);
    expect((await restarted.reserve(start + LIVE_FLIGHT_REFRESH_MS - 1)).allowed).toBe(false);
    expect((await restarted.reserve(start + LIVE_FLIGHT_REFRESH_MS)).allowed).toBe(true);
    expect(restarted.getState(start).count).toBe(2);
  });
  it('never admits beyond 450 on a UTC day, including restart per attempt', async () => {
    const store = new TestBudgetStore();
    // Seed a valid full ledger to test the hard cap independently of pacing.
    store.contents = JSON.stringify({ version: 1, day: '2026-10-15', count: 449, nextRequestAt: 0, blockedUntil: 0, pending: null });
    const a = budget(store);
    const slot = await a.reserve(start);
    await a.complete(slot.reservation!, start);
    expect((await budget(store).reserve(start + 210_000)).allowed).toBe(false);
    const next = budget(store);
    expect((await next.reserve(start + 86_400_000)).allowed).toBe(true);
    expect(next.getState(start).count).toBe(1);
  });
  it('preserves a cooldown across midnight, restart and clock rollback', async () => {
    const store = new TestBudgetStore();
    const a = budget(store);
    const slot = await a.reserve(start + 86_399_000);
    const until = start + 90_000_000;
    await a.complete(slot.reservation!, start + 86_401_000, until);
    const b = budget(store);
    expect((await b.reserve(start + 86_500_000)).allowed).toBe(false);
    expect(b.getState(start)).toMatchObject({ day: '2026-10-16', count: 0 });
    expect(b.blockedUntil()).toBe(until);
    expect((await b.reserve(start)).allowed).toBe(false);
    expect((await b.reserve(until)).allowed).toBe(true);
    expect(b.getState(start).count).toBe(1);
  });
  it('closes the migration/deletion day instead of inventing an unused allowance', async () => {
    const store = new TestBudgetStore();
    const a = new PersistentFlightBudget(store);
    expect((await a.reserve(start + 12_345)).allowed).toBe(false);
    expect(a.getState(start).count).toBe(450);
    expect((await new PersistentFlightBudget(store).reserve(start + 86_400_000)).allowed).toBe(true);
  });
  it.each(['read', 'compareAndSwap'] as const)('fails closed on %s errors', async (method) => {
    const store = new TestBudgetStore();
    vi.spyOn(store, method).mockRejectedValue(new Error('storage unavailable'));
    await expect(budget(store).reserve(start)).rejects.toThrow('upstream requests paused');
  });
  it('does not retry an uncertain committed admission and leaves its latch durable', async () => {
    const store = new TestBudgetStore();
    const write = store.compareAndSwap.bind(store);
    const spy = vi.spyOn(store, 'compareAndSwap').mockImplementationOnce(async (...args) => {
      await write(...args);
      throw new Error('response lost after commit');
    });
    await expect(budget(store).reserve(start)).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await budget(store).reserve(start + 86_400_000)).allowed).toBe(false);
    expect(JSON.parse(store.contents!).pending).toEqual(expect.any(String));
  });
  it('keeps other instances blocked when a 429 completion cannot be persisted', async () => {
    const store = new TestBudgetStore();
    const a = budget(store);
    const slot = await a.reserve(start);
    const spy = vi.spyOn(store, 'compareAndSwap').mockRejectedValueOnce(new Error('offline'));
    await expect(a.complete(slot.reservation!, start + 1000, start + 3_600_000)).rejects.toThrow();
    spy.mockRestore();
    expect((await budget(store).reserve(start + 3_600_000)).allowed).toBe(false);
  });
  it.each(['{}', '{bad', '{"version":2}', JSON.stringify({ version: 1, day: '2026-02-30', count: 0, nextRequestAt: 0, blockedUntil: 0, pending: null })])('never resets a corrupt ledger: %s', async (contents) => {
    const store = new TestBudgetStore();
    store.contents = contents;
    await expect(budget(store).reserve(start)).rejects.toThrow();
    expect(store.contents).toBe(contents);
    expect(store.generation).toBe(0);
  });
  it('bounds contention retries and rejects obsolete completions', async () => {
    const store = new TestBudgetStore();
    const a = budget(store);
    const slot = await a.reserve(start);
    await expect(a.complete('00000000-0000-0000-0000-000000000000', start)).rejects.toThrow();
    await a.complete(slot.reservation!, start);
    const spy = vi.spyOn(store, 'compareAndSwap').mockRejectedValue(new BudgetConflict());
    await expect(a.reserve(start + 210_000)).rejects.toThrow('paused');
    expect(spy).toHaveBeenCalledTimes(8);
  });
});
