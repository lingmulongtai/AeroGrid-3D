import { useCallback, useEffect, useRef } from 'react';

const pageVisible = () => document.visibilityState !== 'hidden';

/** One request at a time; hidden time never accumulates a backlog of polls. */
export function useLivePolling(
  load: (signal: AbortSignal, manual: boolean) => Promise<void>,
  enabled: boolean, intervalMs: number, scope: string, paused = false,
  canPoll: () => boolean = () => true,
) {
  const latest = useRef({ load, canPoll });
  latest.current = { load, canPoll };
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
    const schedule = () => {
      clearTimer();
      if (!disposed && !paused && pageVisible() && latest.current.canPoll()) {
        timer = window.setTimeout(() => { void run(); }, Math.max(0, intervalMs - (Date.now() - (clock.current.last ?? -Infinity))));
      }
    };
    const run = async (manual = false) => {
      clearTimer();
      if (disposed || paused || !pageVisible() || !latest.current.canPoll() || request) return;
      if (!manual && clock.current.last !== undefined && Date.now() - clock.current.last < intervalMs) { schedule(); return; }
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
