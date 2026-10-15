import type {
  AtlasStatus,
  DataSnapshot,
  FlightRecord,
  SourceHealth,
  SourceStatus,
  WeatherFrame,
} from '../../shared/contracts.js';
import { APP_VERSION, LIVE_FLIGHT_REFRESH_MS, LIVE_STALE_AFTER_MS, LIVE_UNAVAILABLE_AFTER_MS, statusForAge } from '../../shared/contracts.js';
import { ExpiringCache } from '../lib/cache.js';
import { DailyQuota } from '../lib/quota.js';
import { LocalFlightBudget, type FlightBudget } from '../lib/flightBudget.js';
import { AirplanesLiveProvider } from '../providers/airplanesLive.js';
import { ProviderError } from '../providers/errors.js';
import { RainViewerProvider } from '../providers/rainViewer.js';

const FLIGHT_CACHE_TTL_MS = LIVE_FLIGHT_REFRESH_MS;
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
  budget?: FlightBudget;
  now?: () => number;
  revision?: string;
  flightSource?: string;
  providerBlockedUntil?: () => number;
}

function initialHealth(source: string): SourceHealth {
  return { status: 'unavailable', source, updatedAt: null, message: 'Waiting for first request' };
}

function normalizeFlightQuery(query: FlightQuery): FlightQuery {
  return { latitude: Math.round(query.latitude * 10) / 10, longitude: Math.round(query.longitude * 10) / 10, radiusNm: Math.ceil(query.radiusNm / 5) * 5 };
}

function flightCacheKey(query: FlightQuery): string {
  return [query.latitude, query.longitude, query.radiusNm].join(':');
}

function statusFromError(error: unknown): SourceStatus {
  return error instanceof ProviderError && error.statusCode === 429
    ? 'rate-limited'
    : 'unavailable';
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown provider error';
}

function nextUtcDay(nowMs: number): number {
  const date = new Date(nowMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

export function createAtlasDataService(dependencies: AtlasDataDependencies = {}): AtlasDataService {
  const flightProvider = dependencies.flightProvider ?? new AirplanesLiveProvider(fetch, Date.now, undefined, { source: 'adsb.lol' });
  const flightSource = dependencies.flightSource ?? (dependencies.flightProvider ? 'airplanes.live' : 'adsb.lol');
  const weatherProvider = dependencies.weatherProvider ?? new RainViewerProvider();
  const quota = dependencies.budget ?? new LocalFlightBudget(dependencies.quota ?? new DailyQuota(DAILY_FLIGHT_REQUEST_LIMIT));
  const now = dependencies.now ?? Date.now;
  const revision = dependencies.revision;
  const flightCache = new ExpiringCache<DataSnapshot<FlightRecord>>();
  const weatherCache = new ExpiringCache<DataSnapshot<WeatherFrame>>();
  const inFlightRequests = new Map<string, Promise<DataSnapshot<FlightRecord>>>();

  let flightHealth = initialHealth(flightSource);
  let weatherHealth = initialHealth('rainviewer');
  let flightProviderBlockedUntil = 0;
  const blockedUntil = () => Math.max(flightProviderBlockedUntil, quota.blockedUntil(), dependencies.providerBlockedUntil?.() ?? 0);

  async function getFlights(query: FlightQuery): Promise<DataSnapshot<FlightRecord>> {
    query = normalizeFlightQuery(query);
    const key = flightCacheKey(query);
    const existingRequest = inFlightRequests.get(key);
    if (existingRequest) return existingRequest;

    const request = loadFlights(key, query);
    inFlightRequests.set(key, request);
    try {
      return await request;
    } finally {
      if (inFlightRequests.get(key) === request) inFlightRequests.delete(key);
    }
  }

  async function loadFlights(key: string, query: FlightQuery): Promise<DataSnapshot<FlightRecord>> {
    const nowMs = now();
    const cached = flightCache.getFresh(key, nowMs);
    if (cached && Date.parse(cached.expiresAt) > nowMs && statusForAge(cached.generatedAt, nowMs) !== 'unavailable') {
      const status = statusForAge(cached.generatedAt, nowMs);
      return scheduled(status === cached.status ? cached : { ...cached, status }, nowMs);
    }

    if (nowMs < blockedUntil()) {
      const retryAfterSeconds = Math.ceil((blockedUntil() - nowMs) / 1_000);
      return staleFlightSnapshot(key, query, nowMs, 'Flight provider retry is paused after HTTP 429', 'rate-limited', retryAfterSeconds);
    }

    let admission;
    try { admission = await quota.reserve(nowMs); }
    catch (error) {
      const respondedAt = now();
      const quotaState = quota.getState(respondedAt);
      flightHealth = { ...flightHealth, status: 'unavailable', message: messageFromError(error), requestCount: quotaState.count, requestLimit: quotaState.limit };
      return staleFlightSnapshot(key, query, respondedAt, messageFromError(error), 'unavailable', 60);
    }
    if (!admission.allowed) {
      const respondedAt = now();
      const quotaState = quota.getState(respondedAt);
      const retryAfterSeconds = Math.ceil((quota.nextAllowedAt(respondedAt) - respondedAt) / 1000);
      flightHealth = { ...flightHealth, requestCount: quotaState.count, requestLimit: quotaState.limit };
      if (respondedAt < blockedUntil()) {
        return staleFlightSnapshot(key, query, respondedAt, 'Flight provider retry is paused after HTTP 429', 'rate-limited', retryAfterSeconds);
      }
      if (quotaState.count < quotaState.limit) {
        return staleFlightSnapshot(key, query, respondedAt, 'Shared aircraft update scheduled to protect the daily allowance', 'unavailable', retryAfterSeconds, 'budget-paced');
      }
      const message = 'Daily Live Beta request budget is exhausted';
      flightHealth = {
        status: 'rate-limited',
        source: flightSource,
        updatedAt: flightHealth.updatedAt,
        message,
        requestCount: quotaState.count,
        requestLimit: quotaState.limit,
      };
      return staleFlightSnapshot(key, query, respondedAt, message, 'rate-limited', retryAfterSeconds);
    }

    let completionAttempted = false;
    try {
      const result = await flightProvider.fetchFlights(query.latitude, query.longitude, query.radiusNm);
      const completedAt = now();
      if (!Number.isFinite(result.generatedAtMs) || result.generatedAtMs > completedAt + LIVE_STALE_AFTER_MS) {
        throw new ProviderError('Flight provider returned an invalid observation time');
      }
      const generatedAt = new Date(result.generatedAtMs).toISOString();
      if (statusForAge(generatedAt, completedAt) === 'unavailable') throw new ProviderError('Flight provider observation is more than five minutes old');
      completionAttempted = true;
      await quota.complete(admission.reservation!, completedAt);
      const respondedAt = now();
      const status = statusForAge(generatedAt, respondedAt);
      if (status === 'unavailable') throw new ProviderError('Flight provider observation is more than five minutes old');
      const snapshot: DataSnapshot<FlightRecord> = scheduled({
        mode: 'live-beta',
        source: flightSource,
        status,
        generatedAt,
        expiresAt: new Date(nowMs + FLIGHT_CACHE_TTL_MS).toISOString(),
        coverage: {
          kind: 'radius',
          center: { latitude: query.latitude, longitude: query.longitude },
          radiusNm: query.radiusNm,
        },
        items: result.items,
      }, respondedAt);
      flightCache.set(key, snapshot, FLIGHT_CACHE_TTL_MS, nowMs);
      const quotaState = quota.getState(respondedAt);
      flightHealth = {
        status,
        source: flightSource,
        updatedAt: generatedAt,
        requestCount: quotaState.count,
        requestLimit: quotaState.limit,
      };
      return snapshot;
    } catch (error) {
      const failedAt = now();
      const sourceStatus = statusFromError(error);
      let message = messageFromError(error);
      const retryAfterSeconds = error instanceof ProviderError ? error.retryAfterSeconds : undefined;
      if (sourceStatus === 'rate-limited') {
        flightProviderBlockedUntil = retryAfterSeconds
          ? failedAt + Math.max(1, retryAfterSeconds) * 1_000
          : nextUtcDay(failedAt);
      }
      if (!completionAttempted) {
        try { await quota.complete(admission.reservation!, failedAt, blockedUntil()); }
        catch (storageError) { message = `${message}; ${messageFromError(storageError)}`; }
      }
      flightHealth = {
        status: sourceStatus,
        source: flightSource,
        updatedAt: flightHealth.updatedAt,
        message,
        requestCount: quota.getState(failedAt).count,
        requestLimit: quota.getState(failedAt).limit,
      };
      return staleFlightSnapshot(key, query, now(), message, sourceStatus, retryAfterSeconds);
    }
  }

  function scheduled(snapshot: DataSnapshot<FlightRecord>, nowMs: number): DataSnapshot<FlightRecord> {
    const next = Math.max(quota.nextAllowedAt(nowMs), blockedUntil(), Date.parse(snapshot.expiresAt));
    const nextRefreshAt = new Date(next).toISOString();
    const nextRefreshAfterMs = Math.max(0, next - nowMs);
    return snapshot.nextRefreshAt === nextRefreshAt && snapshot.nextRefreshAfterMs === nextRefreshAfterMs
      ? snapshot : { ...snapshot, nextRefreshAt, nextRefreshAfterMs };
  }

  function staleFlightSnapshot(
    key: string,
    query: FlightQuery,
    nowMs: number,
    message: string,
    failureStatus: SourceStatus,
    retryAfterSeconds?: number,
    reason?: 'budget-paced',
  ): DataSnapshot<FlightRecord> {
    const stale = flightCache.getWithinStaleWindow(key, STALE_WINDOW_MS, nowMs);
    // Retention is measured from the observation time, never TTL + five minutes.
    if (stale && nowMs - Date.parse(stale.generatedAt) <= LIVE_UNAVAILABLE_AFTER_MS) {
      return scheduled({ ...stale, status: 'stale', message, retryAfterSeconds, reason }, nowMs);
    }
    return scheduled({
      mode: 'live-beta',
      source: flightSource,
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
      reason,
    }, nowMs);
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
      version: APP_VERSION,
      ...(revision ? { revision } : {}),
      status: flightHealth.status === 'available' || weatherHealth.status === 'available' ? 'ok' : 'degraded',
      time: new Date(now()).toISOString(),
      sources: { flights: flightHealth, weather: weatherHealth },
    };
  }

  return { getFlights, getWeather, getStatus };
}
