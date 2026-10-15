import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ factory: vi.fn() }));
vi.mock('../providers/flightBudgetStore', () => ({
  BudgetConflict: class extends Error {},
  cloudFlightBudgetStore: mocks.factory,
}));
import { createFlightBudgets } from './flightBudgetConfig';
import { LocalFlightBudget, PersistentFlightBudget } from './flightBudget';

describe('aircraft budget runtime configuration', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uses a sibling prefix from the existing shared orbital configuration in either region', () => {
    for (const K_SERVICE of ['west', 'tokyo']) {
      const budgets = createFlightBudgets({ K_SERVICE, ORBIT_CACHE_PATH: 'gs://private/cache/orbits.json' });
      for (const source of ['adsb.lol', 'airplanes.live', 'adsbexchange'] as const) {
        expect(budgets(source)).toBeInstanceOf(PersistentFlightBudget);
        expect(budgets(source)).toBe(budgets(source));
        expect(mocks.factory).toHaveBeenCalledWith(`gs://private/cache/aircraft-budget/${source}.json`);
      }
      expect(budgets('adsb.lol')).not.toBe(budgets('airplanes.live'));
    }
  });
  it('supports an explicit shared prefix', () => {
    createFlightBudgets({ FLIGHT_BUDGET_PREFIX: 'gs://private/flight-quota/' })('adsb.lol');
    expect(mocks.factory).toHaveBeenCalledWith('gs://private/flight-quota/adsb.lol.json');
  });
  it.each([{ NODE_ENV: 'production' }, { K_SERVICE: 'cloud-run' }, { NODE_ENV: 'production', ORBIT_CACHE_PATH: '/tmp/orbits.json' }])('fails closed without durable production configuration: %j', async (env) => {
    const budget = createFlightBudgets(env)('adsb.lol');
    await expect(budget.reserve(Date.now())).rejects.toThrow('upstream requests paused');
    expect(mocks.factory).not.toHaveBeenCalled();
  });
  it('allows explicit memory-only local development', () => {
    expect(createFlightBudgets({})('adsb.lol')).toBeInstanceOf(LocalFlightBudget);
  });
});
