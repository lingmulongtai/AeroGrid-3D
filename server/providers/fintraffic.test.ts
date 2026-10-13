import { describe, expect, it, vi } from 'vitest';
import { fetchFintrafficShips } from './fintraffic';
const now = Date.UTC(2026, 9, 13, 6);
describe('public maritime observations', () => {
  it('filters AIS using epoch milliseconds instead of AIS seconds-of-minute', async () => {
    const feature = (id: number, time: number) => ({ geometry: { coordinates: [25, 60] }, properties: { mmsi: id, timestamp: 44, timestampExternal: time, sog: 4, heading: 90 } });
    const ships = await fetchFintrafficShips(async () => Response.json({ features: [feature(230123456, now - 1000), feature(230654321, now - 6 * 60_000)] }), now);
    expect(ships).toHaveLength(1); expect(ships[0].receivedAt).toBe(new Date(now - 1000).toISOString());
  });
});
