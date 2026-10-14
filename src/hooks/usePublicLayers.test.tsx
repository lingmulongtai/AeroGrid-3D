import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RadiusCoverage } from '../../shared/contracts';
import { DEFAULT_LAYERS } from '../types/layers';
import { usePublicLayers } from './usePublicLayers';

const coverage: RadiusCoverage = { kind: 'radius', center: { latitude: 35.68, longitude: 139.76 }, radiusNm: 150 };
const layers = { ...DEFAULT_LAYERS, satellites: true, cameras: true, weather: true, ships: true };
const snapshot = (source: string) => ({ mode: 'live-beta', source, status: 'available',
  generatedAt: '2026-10-15T00:00:00.000Z', expiresAt: '2026-10-15T02:00:00.000Z', coverage: { kind: 'global' }, items: [{ id: 'fixture' }] });
function stubFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => Response.json(snapshot(String(input).includes('satellites') ? 'celestrak' : 'fintraffic')));
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('public layer catalog requests', () => {
  it('does not refetch satellites/cameras on area or refresh changes, while ships/clouds still refresh', async () => {
    const fetch = stubFetch();
    const { result, rerender } = renderHook(({ area, token }) => usePublicLayers('live-beta', area, layers, token, 2400), { initialProps: { area: coverage, token: 0 } });
    await waitFor(() => expect(result.current.orbits.status).toBe('available'));
    expect(fetch).toHaveBeenCalledTimes(4);
    rerender({ area: { ...coverage, center: { latitude: 45, longitude: 0 } }, token: 1 });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
    rerender({ area: { ...coverage, center: { latitude: 45, longitude: 0 } }, token: 2 });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(8));
    const urls = fetch.mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => url.includes('/satellites'))).toEqual(['/api/v1/satellites?limit=2400']);
    expect(urls.filter((url) => url.includes('/cameras'))).toHaveLength(1);
    expect(urls.filter((url) => url.includes('/ships'))).toHaveLength(3);
    expect(urls.filter((url) => url.includes('/clouds'))).toHaveLength(3);
  });

  it('refetches just the satellite catalog with the new quality limit', async () => {
    const fetch = stubFetch();
    const { result, rerender } = renderHook(({ limit }) => usePublicLayers('live-beta', coverage, layers, 0, limit), { initialProps: { limit: 300 } });
    await waitFor(() => expect(result.current.orbits.status).toBe('available'));
    rerender({ limit: 4200 });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('/satellites')).map(([url]) => url)).toEqual(['/api/v1/satellites?limit=300', '/api/v1/satellites?limit=4200']);
  });

  it('does not request live catalogs in demo mode', () => {
    const fetch = stubFetch();
    renderHook(() => usePublicLayers('demo', coverage, layers, 0, 1200));
    expect(fetch).not.toHaveBeenCalled();
  });
});
