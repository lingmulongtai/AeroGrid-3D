import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RadiusCoverage } from '../../shared/contracts';
import { useAtlasData } from './useAtlasData';

const coverage: RadiusCoverage = {
  kind: 'radius', center: { latitude: 35.68, longitude: 139.76 }, radiusNm: 150,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useAtlasData', () => {
  it('stops flights and weather while hidden, retaining cadence on return', async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = 'hidden';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => Response.json({ mode: 'live-beta', source: String(url).includes('weather') ? 'rainviewer' : 'adsb.lol', status: 'available', generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), coverage, items: [] }));
    const { result } = renderHook(() => useAtlasData({ mode: 'live-beta', coverage, flightsEnabled: true, weatherEnabled: true, demoFlightCount: 12, refreshToken: 0 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); await result.current.refreshWeather(); });
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => { visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it('creates deterministic demo data without calling a live endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useAtlasData({
      mode: 'demo', coverage, flightsEnabled: true, weatherEnabled: true,
      demoFlightCount: 12, refreshToken: 0,
    }));

    await waitFor(() => expect(result.current.flightSnapshot.items).toHaveLength(12));
    expect(result.current.flightSnapshot).toMatchObject({ mode: 'demo', source: 'demo', status: 'available' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never inserts demo aircraft when Live Beta fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useAtlasData({
      mode: 'live-beta', coverage, flightsEnabled: true, weatherEnabled: false,
      demoFlightCount: 12, refreshToken: 0,
    }));

    await waitFor(() => expect(result.current.flightSnapshot.message).toBe('offline'));
    expect(result.current.flightSnapshot).toMatchObject({ mode: 'live-beta', source: 'adsb.lol', items: [] });
  });

  it('loads a requested live coverage area', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).includes('/api/v1/weather')) {
        return Response.json({ mode: 'live-beta', source: 'rainviewer', status: 'available', generatedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), coverage: { kind: 'global' }, items: [] });
      }
      return Response.json({ mode: 'live-beta', source: 'airplanes.live', status: 'available', generatedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), coverage, items: [] });
    });
    const { result } = renderHook(() => useAtlasData({
      mode: 'live-beta', coverage, flightsEnabled: true, weatherEnabled: true,
      demoFlightCount: 12, refreshToken: 0,
    }));

    await waitFor(() => expect(result.current.flightSnapshot.status).toBe('available'));
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('radius_nm=150'), expect.any(Object));
  });
});
