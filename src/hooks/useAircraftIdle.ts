import { useCallback, useEffect, useRef, useState } from 'react';

export const AIRCRAFT_IDLE_MS = 15 * 60_000;
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'touchmove'] as const;

export function useAircraftIdle(enabled: boolean, idleMs = AIRCRAFT_IDLE_MS) {
  const [paused, setPaused] = useState(false);
  const [resumeToken, setResumeToken] = useState(0);
  const lastActivity = useRef(Date.now());
  const pausedNow = useRef(false);
  const resumeRef = useRef<() => void>(() => {});
  const isIdle = useCallback(() => enabled && (pausedNow.current || Date.now() - lastActivity.current >= idleMs), [enabled, idleMs]);
  useEffect(() => {
    lastActivity.current = Date.now(); pausedNow.current = false; setPaused(false);
    if (!enabled) return;
    let timer: number;
    let wasHidden = document.visibilityState === 'hidden';
    const check = () => {
      const remaining = idleMs - (Date.now() - lastActivity.current);
      if (remaining > 0) timer = window.setTimeout(check, remaining);
      else { pausedNow.current = true; setPaused(true); }
    };
    const resume = (force: boolean) => {
      if (document.visibilityState === 'hidden') return;
      const idle = isIdle();
      lastActivity.current = Date.now(); pausedNow.current = false; setPaused(false);
      if (idle) {
        // Explicit activity/resume forces one fresh request, even before cadence.
        // Visibility return uses the poller's due check instead, avoiding a race.
        if (force) setResumeToken((value) => value + 1);
        window.clearTimeout(timer); check();
      }
    };
    const activity = () => resume(true);
    const visibility = () => {
      const hidden = document.visibilityState === 'hidden';
      if (wasHidden && !hidden) resume(false);
      wasHidden = hidden;
    };
    resumeRef.current = activity;
    check();
    for (const event of ACTIVITY_EVENTS) document.addEventListener(event, activity, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.clearTimeout(timer); resumeRef.current = () => {};
      for (const event of ACTIVITY_EVENTS) document.removeEventListener(event, activity);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [enabled, idleMs, isIdle]);
  const resume = useCallback(() => resumeRef.current(), []);
  return { paused: enabled && paused, resumeToken, resume, isIdle };
}
