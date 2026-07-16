import { describe, expect, it } from 'vitest';
import { DailyQuota } from './quota';

describe('DailyQuota', () => {
  it('enforces the daily limit and resets on the next UTC day', () => {
    const quota = new DailyQuota(2);
    const dayOne = Date.UTC(2026, 6, 16, 23, 59);
    const dayTwo = Date.UTC(2026, 6, 17, 0, 1);

    expect(quota.tryTake(dayOne)).toBe(true);
    expect(quota.tryTake(dayOne)).toBe(true);
    expect(quota.tryTake(dayOne)).toBe(false);
    expect(quota.tryTake(dayTwo)).toBe(true);
    expect(quota.getState(dayTwo)).toMatchObject({ count: 1, limit: 2, day: '2026-07-17' });
  });
});
