import { describe, expect, it, vi } from 'vitest';
import { PublicLayers } from './publicLayers';
describe('shared public data limits', () => {
  it('recovers after backoff even when clients poll more frequently', async () => {
    let now = Date.UTC(2026, 9, 13);
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(Response.json({ features: [] }));
    const data = new PublicLayers(fetchFn, () => now);
    expect((await data.ships()).status).toBe('unavailable');
    now += 30_000; await data.ships(); expect(fetchFn).toHaveBeenCalledTimes(1);
    now += 30_000; expect((await data.ships()).status).toBe('available'); expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
