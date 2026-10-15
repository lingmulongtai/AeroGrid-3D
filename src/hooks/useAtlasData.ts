import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppMode,
  DataSnapshot,
  FlightRecord,
  RadiusCoverage,
  WeatherFrame,
} from '../../shared/contracts';
import { LIVE_FLIGHT_REFRESH_MS, LIVE_STALE_AFTER_MS } from '../../shared/contracts';
import { calculateFlightStats, generateRealisticDemoFlights, type FlightStats } from './useFlightData';
import { connectionHeaders, readConnection } from '../data/connections';
import { useLivePolling } from './useLivePolling';
import { useAircraftIdle } from './useAircraftIdle';

const WEATHER_REFRESH_MS = 60_000;
const DEMO_REFRESH_MS = 20_000;
const CLIENT_STALE_WINDOW_MS = 5 * 60_000;

interface UseAtlasDataOptions {
  mode: AppMode | null;
  coverage: RadiusCoverage;
  flightsEnabled: boolean;
  weatherEnabled: boolean;
  demoFlightCount: number;
  refreshToken: number;
}

interface AtlasDataState {
  flightSnapshot: DataSnapshot<FlightRecord>;
  weatherSnapshot: DataSnapshot<WeatherFrame>;
  flightStats: FlightStats;
  loading: boolean;
  refreshWeather: () => Promise<void>;
  autoRefreshPaused: boolean;
  resumeFlights: () => void;
}

function emptySnapshot<T>(mode: AppMode, source: string): DataSnapshot<T> {
  const now = new Date().toISOString();
  return {
    mode,
    source,
    status: 'unavailable',
    generatedAt: now,
    expiresAt: now,
    coverage: mode === 'demo'
      ? { kind: 'global' }
      : { kind: 'radius', center: { latitude: 35.68, longitude: 139.76 }, radiusNm: 150 },
    items: [],
  };
}

function mergePositionHistory(
  items: FlightRecord[],
  history: Map<string, [number, number, number][]>,
): FlightRecord[] {
  return items.map((flight) => {
    const previous = history.get(flight.id) ?? [];
    const point: [number, number, number] = [flight.longitude, flight.latitude, flight.altitude];
    const last = previous.at(-1);
    const duplicate = last && last[0] === point[0] && last[1] === point[1] && last[2] === point[2];
    const next = duplicate ? previous : [...previous, point].slice(-10);
    history.set(flight.id, next);
    return { ...flight, positionHistory: next };
  });
}

export function useAtlasData({
  mode,
  coverage,
  flightsEnabled,
  weatherEnabled,
  demoFlightCount,
  refreshToken,
}: UseAtlasDataOptions): AtlasDataState {
  const [flightSnapshot, setFlightSnapshot] = useState<DataSnapshot<FlightRecord>>(() => emptySnapshot('demo', 'demo'));
  const [weatherSnapshot, setWeatherSnapshot] = useState<DataSnapshot<WeatherFrame>>(() => emptySnapshot('demo', 'demo'));
  const [loading, setLoading] = useState(false);
  const historyRef = useRef(new Map<string, [number, number, number][]>());
  const lastGoodLiveRef = useRef<DataSnapshot<FlightRecord> | null>(null);
  const flightRequestRef = useRef<AbortSignal | undefined>(undefined);
  const activity = useAircraftIdle(mode === 'live-beta' && flightsEnabled);
  const provider = readConnection()?.flightSource ?? 'adsb.lol';
  const flightScope = `${provider}:${coverage.center.latitude}:${coverage.center.longitude}:${coverage.radiusNm}:${refreshToken}:${activity.resumeToken}`;
  const flightSchedule = useRef<{ scope: string; at: number } | undefined>(undefined);
  const providerCooldowns = useRef(new Map<string, number>());
  const [, setAgeClock] = useState(Date.now);
  useEffect(() => {
    if (mode !== 'live-beta') return;
    let timer: number;
    const generated = Date.parse(flightSnapshot.generatedAt);
    const updateAge = () => {
      window.clearTimeout(timer);
      const now = Date.now();
      setAgeClock(now);
      const next = [generated + LIVE_STALE_AFTER_MS + 1, generated + CLIENT_STALE_WINDOW_MS + 1].find((time) => time > now);
      if (next !== undefined) timer = window.setTimeout(updateAge, next - now);
    };
    updateAge();
    document.addEventListener('visibilitychange', updateAge);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', updateAge); };
  }, [mode, flightSnapshot.generatedAt]);

  const loadLiveFlights = useCallback(async (signal?: AbortSignal) => {
    if (mode !== 'live-beta' || !flightsEnabled) return;
    flightRequestRef.current = signal;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        lat: String(coverage.center.latitude),
        lon: String(coverage.center.longitude),
        radius_nm: String(coverage.radiusNm),
      });
      const response = await fetch(`/api/v1/flights?${params}`, { signal, headers: connectionHeaders() });
      if (!response.ok && response.status !== 429) throw new Error(response.status === 401 ? 'Connection expired; reconnect in settings' : `Flight API HTTP ${response.status}`);
      const snapshot = await response.json() as DataSnapshot<FlightRecord>;
      if (signal?.aborted) return;
      if (snapshot.mode !== 'live-beta' || snapshot.source === 'demo' || !Array.isArray(snapshot.items)) {
        throw new Error('The Live Beta endpoint returned an invalid data contract');
      }
      const receivedAt = Date.now();
      const nextAt = Date.parse(snapshot.nextRefreshAt ?? '');
      flightSchedule.current = Number.isFinite(nextAt) && nextAt > receivedAt ? { scope: flightScope, at: nextAt } : undefined;
      // Cooldowns survive area changes and reconnect/resume intent. Local pacing
      // still permits manual cache reads; the server protects upstream admission.
      if (Number.isFinite(snapshot.retryAfterSeconds) && snapshot.retryAfterSeconds! > 0 && snapshot.reason !== 'budget-paced') {
        providerCooldowns.current.set(provider, Math.max(nextAt || 0, receivedAt + snapshot.retryAfterSeconds! * 1000));
      }
      const next = { ...snapshot, items: mergePositionHistory(snapshot.items, historyRef.current) };
      if (next.status === 'available' || next.status === 'stale') lastGoodLiveRef.current = next;
      setFlightSnapshot(next);
    } catch (error) {
      if (signal?.aborted || (error as Error).name === 'AbortError') return;
      flightSchedule.current = undefined;
      const previous = lastGoodLiveRef.current;
      const previousAge = previous ? Date.now() - Date.parse(previous.generatedAt) : Number.POSITIVE_INFINITY;
      if (previous && previousAge <= CLIENT_STALE_WINDOW_MS) {
        setFlightSnapshot({ ...previous, status: 'stale', message: (error as Error).message });
      } else {
        setFlightSnapshot({
          ...emptySnapshot<FlightRecord>('live-beta', readConnection()?.flightSource ?? 'adsb.lol'),
          coverage,
          message: (error as Error).message,
        });
      }
    } finally {
      if (flightRequestRef.current === signal) setLoading(false);
    }
  }, [coverage, flightsEnabled, mode, provider, flightScope]);

  const loadWeather = useCallback(async (signal?: AbortSignal, forceRefresh = false) => {
    if (mode !== 'live-beta' || !weatherEnabled) return;
    try {
      const response = await fetch(forceRefresh ? '/api/v1/weather?refresh=1' : '/api/v1/weather', { signal });
      const snapshot = await response.json() as DataSnapshot<WeatherFrame>;
      if (signal?.aborted) return;
      if (snapshot.mode !== 'live-beta' || snapshot.source === 'demo' || !Array.isArray(snapshot.items)) {
        throw new Error('The weather endpoint returned an invalid data contract');
      }
      setWeatherSnapshot(snapshot);
    } catch (error) {
      if (signal?.aborted || (error as Error).name === 'AbortError') return;
      setWeatherSnapshot({
        ...emptySnapshot<WeatherFrame>('live-beta', 'rainviewer'),
        message: (error as Error).message,
      });
    }
  }, [mode, weatherEnabled]);

  useEffect(() => {
    historyRef.current.clear();
    lastGoodLiveRef.current = null;
    if (mode === 'live-beta') {
      const blocked = providerCooldowns.current.get(provider) ?? 0;
      setFlightSnapshot({ ...emptySnapshot<FlightRecord>('live-beta', provider), coverage,
        ...(blocked > Date.now() ? { status: 'rate-limited', nextRefreshAt: new Date(blocked).toISOString() } : {}),
      });
      setLoading(false);
    }
  }, [mode, coverage.center.latitude, coverage.center.longitude, coverage.radiusNm, refreshToken, flightsEnabled, provider]);

  useEffect(() => {
    if (mode === 'live-beta') setWeatherSnapshot(emptySnapshot<WeatherFrame>('live-beta', 'rainviewer'));
  }, [mode, weatherEnabled]);

  useEffect(() => {
    if (mode === 'demo') {
      const updateDemo = () => {
        const nowMs = Math.floor(Date.now() / DEMO_REFRESH_MS) * DEMO_REFRESH_MS;
        const items = flightsEnabled ? generateRealisticDemoFlights(demoFlightCount, nowMs) : [];
        const generatedAt = new Date(nowMs).toISOString();
        setFlightSnapshot({
          mode: 'demo', source: 'demo', status: 'available', generatedAt,
          expiresAt: new Date(nowMs + DEMO_REFRESH_MS).toISOString(),
          coverage: { kind: 'global' }, items,
        });
        setWeatherSnapshot({
          mode: 'demo', source: 'demo', status: weatherEnabled ? 'available' : 'unavailable', generatedAt,
          expiresAt: new Date(nowMs + DEMO_REFRESH_MS).toISOString(),
          coverage: { kind: 'global' }, items: [],
        });
      };
      updateDemo();
      const interval = window.setInterval(updateDemo, DEMO_REFRESH_MS);
      return () => clearInterval(interval);
    }

  }, [demoFlightCount, flightsEnabled, mode, weatherEnabled]);

  useLivePolling(loadLiveFlights, mode === 'live-beta' && flightsEnabled, LIVE_FLIGHT_REFRESH_MS, flightScope, activity.paused, () => !activity.isIdle(), (manual) => {
    const blocked = providerCooldowns.current.get(provider) ?? 0;
    if (blocked > Date.now()) return blocked;
    return !manual && flightSchedule.current?.scope === flightScope ? flightSchedule.current.at : undefined;
  });
  const refreshWeather = useLivePolling(loadWeather, mode === 'live-beta' && weatherEnabled, WEATHER_REFRESH_MS, String(refreshToken));

  const baseSnapshot = flightSnapshot.mode === mode || !mode ? flightSnapshot : emptySnapshot<FlightRecord>(mode, mode === 'demo' ? 'demo' : readConnection()?.flightSource ?? 'adsb.lol');
  const age = Date.now() - Date.parse(baseSnapshot.generatedAt);
  const phase = mode === 'live-beta' && (baseSnapshot.status === 'available' || baseSnapshot.status === 'stale')
    ? age > CLIENT_STALE_WINDOW_MS ? 'expired' : age > LIVE_STALE_AFTER_MS ? 'stale' : 'fresh' : 'fresh';
  const visibleFlightSnapshot = useMemo<DataSnapshot<FlightRecord>>(() => phase === 'expired' ? { ...baseSnapshot, status: 'unavailable', items: [] }
    : phase === 'stale' ? { ...baseSnapshot, status: 'stale' } : baseSnapshot, [baseSnapshot, phase]);
  const flightStats = calculateFlightStats(
    visibleFlightSnapshot.items,
    mode === 'live-beta' && visibleFlightSnapshot.status === 'available',
    visibleFlightSnapshot.status === 'rate-limited',
  );

  return { flightSnapshot: visibleFlightSnapshot, weatherSnapshot, flightStats, loading, refreshWeather, autoRefreshPaused: activity.paused, resumeFlights: activity.resume };
}
