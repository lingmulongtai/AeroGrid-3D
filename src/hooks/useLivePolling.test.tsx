import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLivePolling } from './useLivePolling';

function visibility(value: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(value);
  document.dispatchEvent(new Event('visibilitychange'));
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe('visibility-aware live polling', () => {
  it('aligns polls with an absolute server deadline instead of adding a full local interval', async () => {
    vi.useFakeTimers(); visibility('visible');
    let next: number | undefined;
    const load = vi.fn(async () => { next = Date.now() + 110_000; });
    renderHook(() => useLivePolling(load, true, 210_000, 'area', false, () => true, () => next));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(109_999); });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps a provider deadline across scope changes, manual refreshes and visibility changes', async () => {
    vi.useFakeTimers(); visibility('visible');
    const blockedUntil = Date.now() + 3_600_000;
    const load = vi.fn(async () => {});
    const deadline = () => Date.now() < blockedUntil ? blockedUntil : undefined;
    const { result, rerender } = renderHook(({ scope }) => useLivePolling(load, true, 210_000, scope, false, () => true, deadline), { initialProps: { scope: 'first' } });
    rerender({ scope: 'second' });
    await act(async () => { await result.current(); visibility('hidden'); await vi.advanceTimersByTimeAsync(600_000); visibility('visible'); });
    expect(load).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000_000); });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not load while initially hidden and loads once on return without catch-up', async () => {
    vi.useFakeTimers(); visibility('hidden');
    const load = vi.fn(async () => {});
    renderHook(() => useLivePolling(load, true, 60_000, 'area'));
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
    expect(load).not.toHaveBeenCalled();
    await act(async () => { visibility('visible'); });
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('preserves the last poll time across short and long visibility changes', async () => {
    vi.useFakeTimers(); visibility('visible');
    const load = vi.fn(async () => {});
    renderHook(() => useLivePolling(load, true, 60_000, 'area'));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); visibility('hidden'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); visibility('visible'); });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(40_000); });
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => { visibility('hidden'); await vi.advanceTimersByTimeAsync(600_000); });
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => { visibility('visible'); });
    expect(load).toHaveBeenCalledTimes(3);
  });
  it('aborts an in-flight hidden request and retries it on return', async () => {
    vi.useFakeTimers(); visibility('visible');
    const load = vi.fn((_signal: AbortSignal) => new Promise<void>(() => {}));
    renderHook(() => useLivePolling(load, true, 60_000, 'area'));
    const signal = load.mock.calls[0][0];
    await act(async () => { visibility('hidden'); });
    expect(signal.aborted).toBe(true);
    await act(async () => { visibility('visible'); });
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('starts changed scopes only when visible, and gates explicit refreshes too', async () => {
    vi.useFakeTimers(); visibility('visible');
    const load = vi.fn(async () => {});
    const { result, rerender } = renderHook(({ scope }) => useLivePolling(load, true, 60_000, scope), { initialProps: { scope: 'first' } });
    await act(async () => {});
    await act(async () => { visibility('hidden'); });
    rerender({ scope: 'second' });
    await act(async () => { await result.current(); });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => { visibility('visible'); });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
