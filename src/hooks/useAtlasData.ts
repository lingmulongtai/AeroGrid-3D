import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppMode,
  DataSnapshot,
  FlightRecord,
  RadiusCoverage,
  WeatherFrame,
} from '../../shared/contracts';
import { calculateFlightStats, generateRealisticDemoFlights, type FlightStats } from './useFlightData';
import { connectionHeaders, readConnection } from '../data/connections';
import { useLivePolling } from './useLivePolling';
import { useAircraftIdle } from './useAircraftIdle';

const LIVE_REFRESH_MS = 60_000;
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
      const next = { ...snapshot, items: mergePositionHistory(snapshot.items, historyRef.current) };
      if (next.status === 'available' || next.status === 'stale') lastGoodLiveRef.current = next;
      setFlightSnapshot(next);
    } catch (error) {
      if (signal?.aborted || (error as Error).name === 'AbortError') return;
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
  }, [coverage, flightsEnabled, mode]);

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
      setFlightSnapshot({ ...emptySnapshot<FlightRecord>('live-beta', readConnection()?.flightSource ?? 'adsb.lol'), coverage });
      setLoading(false);
    }
  }, [mode, coverage.center.latitude, coverage.center.longitude, coverage.radiusNm, refreshToken, flightsEnabled]);

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

  const flightScope = `${coverage.center.latitude}:${coverage.center.longitude}:${coverage.radiusNm}:${refreshToken}:${activity.resumeToken}`;
  useLivePolling(loadLiveFlights, mode === 'live-beta' && flightsEnabled, LIVE_REFRESH_MS, flightScope, activity.paused, () => !activity.isIdle());
  const refreshWeather = useLivePolling(loadWeather, mode === 'live-beta' && weatherEnabled, LIVE_REFRESH_MS, String(refreshToken));

  const visibleFlightSnapshot = flightSnapshot.mode === mode || !mode ? flightSnapshot : emptySnapshot<FlightRecord>(mode, mode === 'demo' ? 'demo' : readConnection()?.flightSource ?? 'adsb.lol');
  const flightStats = calculateFlightStats(
    visibleFlightSnapshot.items,
    mode === 'live-beta' && visibleFlightSnapshot.status === 'available',
    visibleFlightSnapshot.status === 'rate-limited',
  );

  return { flightSnapshot: visibleFlightSnapshot, weatherSnapshot, flightStats, loading, refreshWeather, autoRefreshPaused: activity.paused, resumeFlights: activity.resume };
}
