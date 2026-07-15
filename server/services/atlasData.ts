import type {
  AtlasStatus,
  DataSnapshot,
  FlightRecord,
  SourceHealth,
  SourceStatus,
  WeatherFrame,
} from '../../shared/contracts.js';
import { ExpiringCache } from '../lib/cache.js';
import { DailyQuota } from '../lib/quota.js';
import { AirplanesLiveProvider } from '../providers/airplanesLive.js';
import { ProviderError } from '../providers/errors.js';
import { RainViewerProvider } from '../providers/rainViewer.js';

const FLIGHT_CACHE_TTL_MS = 60_000;
const WEATHER_CACHE_TTL_MS = 10 * 60_000;
const STALE_WINDOW_MS = 5 * 60_000;
const DAILY_FLIGHT_REQUEST_LIMIT = 450;

export interface FlightQuery {
  latitude: number;
  longitude: number;
  radiusNm: number;
}

export interface AtlasDataService {
  getFlights(query: FlightQuery): Promise<DataSnapshot<FlightRecord>>;
  getWeather(forceRefresh?: boolean): Promise<DataSnapshot<WeatherFrame>>;
  getStatus(): AtlasStatus;
}

interface AtlasDataDependencies {
  flightProvider?: Pick<AirplanesLiveProvider, 'fetchFlights'>;
  weatherProvider?: Pick<RainViewerProvider, 'fetchWeather'>;
  quota?: DailyQuota;
  now?: () => number;
}

function initialHealth(source: string): SourceHealth {
  return { status: 'unavailable', source, updatedAt: null, message: 'Waiting for first request' };
}

function flightCacheKey(query: FlightQuery): string {
  return [
    query.latitude.toFixed(2),
    query.longitude.toFixed(2),
    Math.round(query.radiusNm),
  ].join(':');
}

function statusFromError(error: unknown): SourceStatus {
  return error instanceof ProviderError && error.statusCode === 429
    ? 'rate-limited'
    : 'unavailable';
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown provider error';
}

export function createAtlasDataService(dependencies: AtlasDataDependencies = {}): AtlasDataService {
  const flightProvider = dependencies.flightProvider ?? new AirplanesLiveProvider();
  const weatherProvider = dependencies.weatherProvider ?? new RainViewerProvider();
  const quota = dependencies.quota ?? new DailyQuota(DAILY_FLIGHT_REQUEST_LIMIT);
  const now = dependencies.now ?? Date.now;
  const flightCache = new ExpiringCache<DataSnapshot<FlightRecord>>();
  const weatherCache = new ExpiringCache<DataSnapshot<WeatherFrame>>();

  let flightHealth = initialHealth('airplanes.live');
  let weatherHealth = initialHealth('rainviewer');

  async function getFlights(query: FlightQuery): Promise<DataSnapshot<FlightRecord>> {
    const nowMs = now();
    const key = flightCacheKey(query);
    const cached = flightCache.getFresh(key, nowMs);
    if (cached) return cached;

    if (!quota.tryTake(nowMs)) {
      const quotaState = quota.getState(nowMs);
      const message = 'Daily Live Beta request budget is exhausted';
      flightHealth = {
        status: 'rate-limited',
        source: 'airplanes.live',
        updatedAt: flightHealth.updatedAt,
        message,
        requestCount: quotaState.count,
        requestLimit: quotaState.limit,
      };
      return staleFlightSnapshot(key, query, nowMs, message, 'rate-limited');
    }

    try {
      const result = await flightProvider.fetchFlights(query.latitude, query.longitude, query.radiusNm);
      const generatedAt = new Date(result.generatedAtMs).toISOString();
      const snapshot: DataSnapshot<FlightRecord> = {
        mode: 'live-beta',
        source: 'airplanes.live',
        status: 'available',
        generatedAt,
        expiresAt: new Date(nowMs + FLIGHT_CACHE_TTL_MS).toISOString(),
        coverage: {
          kind: 'radius',
          center: { latitude: query.latitude, longitude: query.longitude },
          radiusNm: query.radiusNm,
        },
        items: result.items,
      };
      flightCache.set(key, snapshot, FLIGHT_CACHE_TTL_MS, nowMs);
      const quotaState = quota.getState(nowMs);
      flightHealth = {
        status: 'available',
        source: 'airplanes.live',
        updatedAt: generatedAt,
        requestCount: quotaState.count,
        requestLimit: quotaState.limit,
      };
      return snapshot;
    } catch (error) {
      const sourceStatus = statusFromError(error);
      const message = messageFromError(error);
      const retryAfterSeconds = error instanceof ProviderError ? error.retryAfterSeconds : undefined;
      flightHealth = {
        status: sourceStatus,
        source: 'airplanes.live',
        updatedAt: flightHealth.updatedAt,
        message,
        requestCount: quota.getState(nowMs).count,
        requestLimit: quota.getState(nowMs).limit,
      };
      return staleFlightSnapshot(key, query, nowMs, message, sourceStatus, retryAfterSeconds);
    }
  }

  function staleFlightSnapshot(
    key: string,
    query: FlightQuery,
    nowMs: number,
    message: string,
    failureStatus: SourceStatus,
    retryAfterSeconds?: number,
  ): DataSnapshot<FlightRecord> {
    const stale = flightCache.getWithinStaleWindow(key, STALE_WINDOW_MS, nowMs);
    if (stale) {
      return { ...stale, status: 'stale', message, retryAfterSeconds };
    }
    return {
      mode: 'live-beta',
      source: 'airplanes.live',
      status: failureStatus,
      generatedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs).toISOString(),
      coverage: {
        kind: 'radius',
        center: { latitude: query.latitude, longitude: query.longitude },
        radiusNm: query.radiusNm,
      },
      items: [],
      message,
      retryAfterSeconds,
    };
  }

  async function getWeather(forceRefresh = false): Promise<DataSnapshot<WeatherFrame>> {
    const nowMs = now();
    if (!forceRefresh) {
      const cached = weatherCache.getFresh('radar', nowMs);
      if (cached) return cached;
    }

    try {
      const frame = await weatherProvider.fetchWeather();
      const generatedAt = new Date(nowMs).toISOString();
      const snapshot: DataSnapshot<WeatherFrame> = {
        mode: 'live-beta',
        source: 'rainviewer',
        status: 'available',
        generatedAt,
        expiresAt: new Date(nowMs + WEATHER_CACHE_TTL_MS).toISOString(),
        coverage: { kind: 'global' },
        items: [frame],
      };
      weatherCache.set('radar', snapshot, WEATHER_CACHE_TTL_MS, nowMs);
      weatherHealth = { status: 'available', source: 'rainviewer', updatedAt: generatedAt };
      return snapshot;
    } catch (error) {
      const message = messageFromError(error);
      weatherHealth = {
        status: 'unavailable',
        source: 'rainviewer',
        updatedAt: weatherHealth.updatedAt,
        message,
      };
      const stale = weatherCache.getWithinStaleWindow('radar', STALE_WINDOW_MS, nowMs);
      if (stale) return { ...stale, status: 'stale', message };
      return {
        mode: 'live-beta',
        source: 'rainviewer',
        status: 'unavailable',
        generatedAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(nowMs).toISOString(),
        coverage: { kind: 'global' },
        items: [],
        message,
      };
    }
  }

  function getStatus(): AtlasStatus {
    return {
      service: 'aerogrid-3d',
      status: flightHealth.status === 'available' || weatherHealth.status === 'available' ? 'ok' : 'degraded',
      time: new Date(now()).toISOString(),
      sources: { flights: flightHealth, weather: weatherHealth },
    };
  }

  return { getFlights, getWeather, getStatus };
}
