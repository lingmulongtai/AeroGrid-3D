import { describe, expect, it } from 'vitest';
import { ExpiringCache } from './cache';

describe('ExpiringCache', () => {
  it('returns fresh values and retains them only for the configured stale window', () => {
    const cache = new ExpiringCache<string>();
    cache.set('tokyo', 'snapshot', 60_000, 1_000);

    expect(cache.getFresh('tokyo', 61_000)).toBe('snapshot');
    expect(cache.getFresh('tokyo', 61_001)).toBeNull();
    expect(cache.getWithinStaleWindow('tokyo', 300_000, 361_000)).toBe('snapshot');
    expect(cache.getWithinStaleWindow('tokyo', 300_000, 361_001)).toBeNull();
  });
});
