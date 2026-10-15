import { describe, expect, it } from 'vitest';
import { DailyQuota } from './quota';

describe('DailyQuota', () => {
  it('paces shared admissions without charging denied attempts', () => {
    const quota = new DailyQuota(2);
    const start = Date.UTC(2026, 9, 15);
    expect(quota.tryTake(start, 210_000)).toBe(true);
    expect(quota.tryTake(start + 209_999, 210_000)).toBe(false);
    expect(quota.getState(start).count).toBe(1);
    expect(quota.nextAllowedAt(start + 1000)).toBe(start + 210_000);
    expect(quota.tryTake(start + 210_000, 210_000)).toBe(true);
    expect(quota.tryTake(start + 420_000, 210_000)).toBe(false);
    expect(quota.getState(start).count).toBe(2);
    expect(quota.nextAllowedAt(start)).toBe(start + 86_400_000);
  });

  it('starts a new UTC budget at midnight without carrying yesterday\'s pacing gate', () => {
    const midnight = Date.UTC(2026, 9, 16);
    const quota = new DailyQuota(450);
    expect(quota.tryTake(midnight - 1, 210_000)).toBe(true);
    expect(quota.tryTake(midnight, 210_000)).toBe(true);
    expect(quota.getState(midnight).count).toBe(1);
    expect(quota.nextAllowedAt(midnight)).toBe(midnight + 210_000);
  });

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
