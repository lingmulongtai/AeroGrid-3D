import { useCallback, useEffect, useRef } from 'react';

const pageVisible = () => document.visibilityState !== 'hidden';

/** One request at a time; hidden time never accumulates a backlog of polls. */
export function useLivePolling(
  load: (signal: AbortSignal, manual: boolean) => Promise<void>,
  enabled: boolean, intervalMs: number, scope: string, paused = false,
  canPoll: () => boolean = () => true,
  nextRunAt?: (manual: boolean) => number | undefined,
) {
  const latest = useRef({ load, canPoll, nextRunAt });
  latest.current = { load, canPoll, nextRunAt };
  const clock = useRef<{ scope: string; last?: number }>({ scope });
  const refresh = useRef<() => Promise<void>>(() => Promise.resolve());
  useEffect(() => {
    if (clock.current.scope !== scope) clock.current = { scope };
    if (!enabled) { clock.current.last = undefined; return; }
    let timer: number | undefined, request: AbortController | undefined, previousTime: number | undefined;
    let disposed = false;
    const clearTimer = () => { window.clearTimeout(timer); timer = undefined; };
    const stop = () => {
      clearTimer();
      if (request) { request.abort(); request = undefined; clock.current.last = previousTime; }
    };
    const dueAt = (manual = false) => latest.current.nextRunAt?.(manual)
      ?? (manual ? 0 : (clock.current.last ?? -Infinity) + intervalMs);
    const schedule = () => {
      clearTimer();
      if (!disposed && !paused && pageVisible() && latest.current.canPoll()) {
        timer = window.setTimeout(() => { void run(); }, Math.max(0, dueAt() - Date.now()));
      }
    };
    const run = async (manual = false) => {
      clearTimer();
      if (disposed || paused || !pageVisible() || !latest.current.canPoll() || request) return;
      if (Date.now() < dueAt(manual)) { schedule(); return; }
      const controller = new AbortController();
      previousTime = clock.current.last;
      clock.current.last = Date.now();
      request = controller;
      try { await latest.current.load(controller.signal, manual); }
      finally { if (request === controller) { request = undefined; schedule(); } }
    };
    const visibility = () => { if (pageVisible()) void run(); else stop(); };
    refresh.current = () => run(true);
    document.addEventListener('visibilitychange', visibility);
    void run();
    return () => { disposed = true; stop(); document.removeEventListener('visibilitychange', visibility); refresh.current = () => Promise.resolve(); };
  }, [enabled, intervalMs, scope, paused]);
  return useCallback(() => refresh.current(), []);
}
