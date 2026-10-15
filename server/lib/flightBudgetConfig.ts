import { cloudFlightBudgetStore } from '../providers/flightBudgetStore.js';
import { LocalFlightBudget, PersistentFlightBudget, type FlightBudget } from './flightBudget.js';

export type FlightBudgetSource = 'adsb.lol' | 'airplanes.live' | 'adsbexchange';
export function createFlightBudgets(env: NodeJS.ProcessEnv = process.env): (source: FlightBudgetSource) => FlightBudget {
  const budgets = new Map<FlightBudgetSource, FlightBudget>();
  // Both existing deployment regions already use this private shared bucket.
  // Use separate objects without changing the orbit cache or its IAM policy.
  const prefix = env.FLIGHT_BUDGET_PREFIX ?? (env.ORBIT_CACHE_PATH?.startsWith('gs://')
    ? `${env.ORBIT_CACHE_PATH.slice(0, env.ORBIT_CACHE_PATH.lastIndexOf('/'))}/aircraft-budget` : undefined);
  const production = env.NODE_ENV === 'production' || Boolean(env.K_SERVICE);
  return (source) => {
    let budget = budgets.get(source);
    if (!budget) {
      if (prefix) budget = new PersistentFlightBudget(cloudFlightBudgetStore(`${prefix.replace(/\/$/, '')}/${source}.json`));
      else if (!production) budget = new LocalFlightBudget();
      else {
        // Keep health/static delivery running, but never fall back to memory.
        budget = new PersistentFlightBudget({
          async read() { throw new Error('Configure shared aircraft budget storage'); },
          async compareAndSwap() { throw new Error('Configure shared aircraft budget storage'); },
        });
      }
      budgets.set(source, budget);
    }
    return budget;
  };
}
