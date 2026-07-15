import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppMode,
  DataSnapshot,
  FlightRecord,
  RadiusCoverage,
  WeatherFrame,
} from '../../shared/contracts';
import { calculateFlightStats, generateRealisticDemoFlights, type FlightStats } from './useFlightData';

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

  const loadLiveFlights = useCallback(async (signal?: AbortSignal) => {
    if (mode !== 'live-beta' || !flightsEnabled) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        lat: String(coverage.center.latitude),
        lon: String(coverage.center.longitude),
        radius_nm: String(coverage.radiusNm),
      });
      const response = await fetch(`/api/v1/flights?${params}`, { signal });
      const snapshot = await response.json() as DataSnapshot<FlightRecord>;
      if (snapshot.mode !== 'live-beta' || snapshot.source === 'demo' || !Array.isArray(snapshot.items)) {
        throw new Error('The Live Beta endpoint returned an invalid data contract');
      }
      const next = { ...snapshot, items: mergePositionHistory(snapshot.items, historyRef.current) };
      if (next.status === 'available' || next.status === 'stale') lastGoodLiveRef.current = next;
      setFlightSnapshot(next);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      const previous = lastGoodLiveRef.current;
      const previousAge = previous ? Date.now() - Date.parse(previous.generatedAt) : Number.POSITIVE_INFINITY;
      if (previous && previousAge <= CLIENT_STALE_WINDOW_MS) {
        setFlightSnapshot({ ...previous, status: 'stale', message: (error as Error).message });
      } else {
        setFlightSnapshot({
          ...emptySnapshot<FlightRecord>('live-beta', 'airplanes.live'),
          coverage,
          message: (error as Error).message,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [coverage, flightsEnabled, mode]);

  const loadWeather = useCallback(async (signal?: AbortSignal, forceRefresh = false) => {
    if (mode !== 'live-beta' || !weatherEnabled) return;
    try {
      const response = await fetch(forceRefresh ? '/api/v1/weather?refresh=1' : '/api/v1/weather', { signal });
      const snapshot = await response.json() as DataSnapshot<WeatherFrame>;
      if (snapshot.mode !== 'live-beta' || snapshot.source === 'demo' || !Array.isArray(snapshot.items)) {
        throw new Error('The weather endpoint returned an invalid data contract');
      }
      setWeatherSnapshot(snapshot);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      setWeatherSnapshot({
        ...emptySnapshot<WeatherFrame>('live-beta', 'rainviewer'),
        message: (error as Error).message,
      });
    }
  }, [mode, weatherEnabled]);

  useEffect(() => {
    if (!mode) return;
    historyRef.current.clear();
    lastGoodLiveRef.current = null;

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

    const controller = new AbortController();
    void loadLiveFlights(controller.signal);
    void loadWeather(controller.signal);
    const interval = window.setInterval(() => {
      void loadLiveFlights();
      void loadWeather();
    }, LIVE_REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [demoFlightCount, flightsEnabled, loadLiveFlights, loadWeather, mode, refreshToken, weatherEnabled]);

  const flightStats = calculateFlightStats(
    flightSnapshot.items,
    mode === 'live-beta' && flightSnapshot.status === 'available',
    flightSnapshot.status === 'rate-limited',
  );

  const refreshWeather = useCallback(() => loadWeather(undefined, true), [loadWeather]);

  return { flightSnapshot, weatherSnapshot, flightStats, loading, refreshWeather };
}
