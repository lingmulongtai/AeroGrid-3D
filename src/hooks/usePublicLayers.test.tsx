import { act, renderHook, waitFor } from '@testing-library/react';
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
  it('restores both catalogs after a temporary failure followed by the same ETag', async () => {
    vi.useFakeTimers();
    let offline = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (offline) throw new Error('offline');
      return Response.json(snapshot(String(url).includes('satellites') ? 'celestrak' : 'fintraffic'), { headers: { ETag: '"same-generation"' } });
    });
    const { result } = renderHook(() => usePublicLayers('live-beta', coverage, { ...layers, ships: false, weather: false }, 0, 300));
    await act(async () => {});
    expect(result.current.orbits.items).toHaveLength(1);
    expect(result.current.cameras.items).toHaveLength(1);
    offline = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000); });
    expect(result.current.orbits.items).toEqual([]);
    expect(result.current.cameras.items).toEqual([]);
    offline = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000); });
    expect(result.current.orbits.items).toHaveLength(1);
    expect(result.current.cameras.items).toHaveLength(1);
    expect(result.current.orbits.status).toBe('available');
    expect(result.current.cameras.status).toBe('available');
  });

  it('retains snapshot and item references across identical scheduled catalog responses', async () => {
    vi.useFakeTimers();
    const fetch = stubFetch();
    const render = vi.fn();
    const { result } = renderHook(() => { render(); return usePublicLayers('live-beta', coverage, { ...layers, ships: false, weather: false }, 0, 2400); });
    await act(async () => {});
    const orbits = result.current.orbits, cameras = result.current.cameras;
    expect(orbits.status).toBe('available');
    const renders = render.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60_000); });
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('/satellites'))).toHaveLength(7);
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('/cameras'))).toHaveLength(2);
    expect(result.current.orbits).toBe(orbits);
    expect(result.current.orbits.items).toBe(orbits.items);
    expect(result.current.cameras).toBe(cameras);
    expect(render.mock.calls.length).toBe(renders);
  });

  it('uses matching ETags, accepts 304, and updates changed generations or availability', async () => {
    vi.useFakeTimers();
    let value = snapshot('celestrak'), etag = '"first"', notModified = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => notModified ? new Response(null, { status: 304 }) : Response.json(value, { headers: { ETag: etag } }));
    const { result } = renderHook(() => usePublicLayers('live-beta', coverage, { ...layers, cameras: false, ships: false, weather: false }, 0, 300));
    await act(async () => {});
    const first = result.current.orbits;
    // Same validator also avoids replacement if the caller's generatedAt differs.
    value = { ...value, generatedAt: '2026-10-15T00:01:00.000Z' };
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
    expect(result.current.orbits).toBe(first);
    notModified = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
    expect(result.current.orbits).toBe(first);
    notModified = false; etag = '"second"';
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
    expect(result.current.orbits).not.toBe(first);
    expect(result.current.orbits.generatedAt).toBe(value.generatedAt);
    value = { ...value, status: 'stale' };
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
    expect(result.current.orbits.status).toBe('stale');
  });

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
