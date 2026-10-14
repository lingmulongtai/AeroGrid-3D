import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIRCRAFT_IDLE_MS, useAircraftIdle } from './useAircraftIdle';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe('aircraft inactivity pause', () => {
  it.each(['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'touchmove'])('pauses at 15 minutes and resumes on %s', async (event) => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAircraftIdle(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(AIRCRAFT_IDLE_MS - 1); });
    expect(result.current.paused).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.paused).toBe(true);
    expect(result.current.isIdle()).toBe(true);
    act(() => { document.dispatchEvent(new Event(event)); });
    expect(result.current.paused).toBe(false);
    expect(result.current.resumeToken).toBe(1);
    act(() => { document.dispatchEvent(new Event(event)); });
    expect(result.current.resumeToken).toBe(1);
  });
  it('extends inactivity from the last operation and supports explicit resume', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAircraftIdle(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); document.dispatchEvent(new Event('wheel')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
    expect(result.current.paused).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
    expect(result.current.paused).toBe(true);
    act(() => { result.current.resume(); });
    expect(result.current.paused).toBe(false);
  });
});
