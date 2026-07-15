import { describe, expect, it } from 'vitest';
import {
  isTrustedLiveSnapshot,
  LIVE_STALE_AFTER_MS,
  LIVE_UNAVAILABLE_AFTER_MS,
  statusForAge,
  type DataSnapshot,
} from './contracts';

describe('statusForAge', () => {
  const now = Date.UTC(2026, 6, 16, 0, 0, 0);

  it('marks recent data available, then stale, then unavailable', () => {
    expect(statusForAge(new Date(now - LIVE_STALE_AFTER_MS).toISOString(), now)).toBe('available');
    expect(statusForAge(new Date(now - LIVE_STALE_AFTER_MS - 1).toISOString(), now)).toBe('stale');
    expect(statusForAge(new Date(now - LIVE_UNAVAILABLE_AFTER_MS - 1).toISOString(), now)).toBe('unavailable');
  });

  it('rejects invalid timestamps', () => {
    expect(statusForAge('not-a-date', now)).toBe('unavailable');
  });
});

describe('isTrustedLiveSnapshot', () => {
  const base: DataSnapshot<never> = {
    mode: 'live-beta',
    source: 'airplanes.live',
    status: 'available',
    generatedAt: '2026-07-16T00:00:00.000Z',
    expiresAt: '2026-07-16T00:01:00.000Z',
    coverage: { kind: 'radius', center: { latitude: 35.68, longitude: 139.76 }, radiusNm: 150 },
    items: [],
  };

  it('accepts an explicitly live provider snapshot', () => {
    expect(isTrustedLiveSnapshot(base)).toBe(true);
  });

  it('never accepts demo data as live data', () => {
    expect(isTrustedLiveSnapshot({ ...base, source: 'demo' })).toBe(false);
    expect(isTrustedLiveSnapshot({ ...base, mode: 'demo' })).toBe(false);
  });
});
