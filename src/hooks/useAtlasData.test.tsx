import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RadiusCoverage } from '../../shared/contracts';
import { LIVE_FLIGHT_REFRESH_MS } from '../../shared/contracts';
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
  it('keeps the server cadence when the browser clock is one minute ahead', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 15) + 60_000);
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const serverNow = Date.now() - 60_000;
      return Response.json({ mode: 'live-beta', source: 'adsb.lol', status: 'available', generatedAt: new Date(serverNow).toISOString(), expiresAt: new Date(serverNow + 210_000).toISOString(), nextRefreshAt: new Date(serverNow + 210_000).toISOString(), nextRefreshAfterMs: 210_000, coverage, items: [] });
    });
    renderHook(() => useAtlasData({ mode: 'live-beta', coverage, flightsEnabled: true, weatherEnabled: false, demoFlightCount: 12, refreshToken: 0 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(209_999); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('polls an actively operated day 412 times and keeps one-minute freshness separate', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 15));
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ mode: 'live-beta', source: 'adsb.lol', status: 'available', generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + LIVE_FLIGHT_REFRESH_MS).toISOString(), nextRefreshAt: new Date(Date.now() + LIVE_FLIGHT_REFRESH_MS).toISOString(), coverage, items: [] }));
    const { result } = renderHook(() => useAtlasData({ mode: 'live-beta', coverage, flightsEnabled: true, weatherEnabled: false, demoFlightCount: 12, refreshToken: 0 }));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
    expect(result.current.flightSnapshot.status).toBe('stale');
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(LIVE_FLIGHT_REFRESH_MS - 60_001); });
    expect(result.current.flightSnapshot.status).toBe('available');
    expect(fetch).toHaveBeenCalledTimes(2);
    // Activity every three minutes keeps the existing 15-minute idle gate open.
    await act(async () => {
      let elapsed = LIVE_FLIGHT_REFRESH_MS;
      while (elapsed < 86_400_000 - 1) {
        document.dispatchEvent(new Event('pointermove'));
        const step = Math.min(180_000, 86_400_000 - 1 - elapsed);
        await vi.advanceTimersByTimeAsync(step); elapsed += step;
      }
    });
    expect(fetch).toHaveBeenCalledTimes(412);
    expect(result.current.autoRefreshPaused).toBe(false);
  });

  it('uses a shared cache deadline sooner than a full interval and retains 429 cooldown across area changes', async () => {
    vi.useFakeTimers();
    const firstAt = Date.now();
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ mode: 'live-beta', source: 'adsb.lol', status: 'stale', generatedAt: new Date(firstAt - 100_000).toISOString(), expiresAt: new Date(firstAt + 110_000).toISOString(), nextRefreshAt: new Date(firstAt + 110_000).toISOString(), coverage, items: [] }))
      .mockImplementation(async () => Response.json({ mode: 'live-beta', source: 'adsb.lol', status: 'rate-limited', generatedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), nextRefreshAt: new Date(Date.now() + 3_600_000).toISOString(), retryAfterSeconds: 3600, coverage, items: [] }, { status: 429 }));
    const { result, rerender } = renderHook(({ area, token }) => useAtlasData({ mode: 'live-beta', coverage: area, flightsEnabled: true, weatherEnabled: false, demoFlightCount: 12, refreshToken: token }), { initialProps: { area: coverage, token: 0 } });
    await act(async () => { await vi.advanceTimersByTimeAsync(109_999); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetch).toHaveBeenCalledTimes(2);
    rerender({ area: { ...coverage, center: { latitude: 50, longitude: 10 } }, token: 1 });
    expect(result.current.flightSnapshot.status).toBe('rate-limited');
    await act(async () => { await vi.advanceTimersByTimeAsync(900_000); result.current.resumeFlights(); });
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000 - 900_000 - 1); document.dispatchEvent(new Event('pointerdown')); });
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('ages hidden aircraft to stale and removes them after five minutes without fetching', async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const item = { id: 'abc123', callsign: 'JAL42', longitude: 139.7, latitude: 35.6, altitude: 9000, velocity: 240, heading: 90, verticalRate: 0, onGround: false, category: 'heavy', lastSeenSeconds: 0.4, positionHistory: [] };
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ mode: 'live-beta', source: 'adsb.lol', status: 'available', generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), coverage, items: [item] }));
    const { result } = renderHook(() => useAtlasData({ mode: 'live-beta', coverage, flightsEnabled: true, weatherEnabled: false, demoFlightCount: 12, refreshToken: 0 }));
    await act(async () => {});
    expect(result.current.flightSnapshot.items).toHaveLength(1);
    await act(async () => { visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(60_001); });
    expect(result.current.flightSnapshot.status).toBe('stale');
    expect(result.current.flightSnapshot.items).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(240_000); });
    expect(result.current.flightSnapshot).toMatchObject({ mode: 'live-beta', source: 'adsb.lol', status: 'unavailable', items: [] });
    expect(result.current.weatherSnapshot.mode).toBe('live-beta');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('stops only aircraft after 15 idle minutes, then resumes immediately on activity', async () => {
    vi.useFakeTimers();
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => Response.json({ mode: 'live-beta', source: String(url).includes('weather') ? 'rainviewer' : 'adsb.lol', status: 'available', generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), coverage, items: [] }));
    const { result } = renderHook(() => useAtlasData({ mode: 'live-beta', coverage, flightsEnabled: true, weatherEnabled: true, demoFlightCount: 12, refreshToken: 0 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(900_000); });
    const flightCalls = () => fetch.mock.calls.filter(([url]) => String(url).includes('/flights')).length;
    expect(flightCalls()).toBe(5); // Initial request + t=210..840s; t=900 is idle.
    expect(result.current.autoRefreshPaused).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000); });
    expect(flightCalls()).toBe(5);
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('/weather')).length).toBeGreaterThan(16);
    await act(async () => { document.dispatchEvent(new Event('pointerdown')); });
    expect(result.current.autoRefreshPaused).toBe(false);
    expect(flightCalls()).toBe(6);
    await act(async () => { await vi.advanceTimersByTimeAsync(900_000); });
    expect(result.current.autoRefreshPaused).toBe(true);
    const pausedCount = flightCalls();
    await act(async () => { result.current.resumeFlights(); });
    expect(flightCalls()).toBe(pausedCount + 1);
    expect(result.current.autoRefreshPaused).toBe(false);
  });
  it('makes only one fresh flight request after returning from a long hidden interval', async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ mode: 'live-beta', source: 'adsb.lol', status: 'available', generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), coverage, items: [] }));
    const { result } = renderHook(() => useAtlasData({ mode: 'live-beta', coverage, flightsEnabled: true, weatherEnabled: false, demoFlightCount: 12, refreshToken: 0 }));
    await act(async () => {});
    await act(async () => { visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(3_600_000); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.autoRefreshPaused).toBe(false);
  });
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
    expect(fetch).toHaveBeenCalledTimes(3); // Weather at 60s; aircraft wait 210s.
    await act(async () => { await vi.advanceTimersByTimeAsync(150_000); });
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('/flights'))).toHaveLength(2);
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('/weather'))).toHaveLength(4);
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
