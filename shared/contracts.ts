export type AppMode = 'demo' | 'live-beta';
export const APP_VERSION = '0.1.0';

export type SourceStatus = 'available' | 'stale' | 'rate-limited' | 'unavailable';

export type FlightCategory =
  | 'light'
  | 'small'
  | 'medium'
  | 'large'
  | 'heavy'
  | 'high_performance'
  | 'rotorcraft';

export type GlobalCoverage = {
  kind: 'global';
};

export type RadiusCoverage = {
  kind: 'radius';
  center: { latitude: number; longitude: number };
  radiusNm: number;
};

export type DataCoverage = GlobalCoverage | RadiusCoverage;

export interface DataSnapshot<T> {
  mode: AppMode;
  source: string;
  status: SourceStatus;
  generatedAt: string;
  expiresAt: string;
  coverage: DataCoverage;
  items: T[];
  message?: string;
  retryAfterSeconds?: number;
}

export interface FlightRecord {
  id: string;
  callsign: string;
  registration?: string;
  aircraftType?: string;
  country?: string;
  longitude: number;
  latitude: number;
  altitude: number;
  velocity: number;
  heading: number;
  verticalRate: number;
  onGround: boolean;
  category: FlightCategory;
  lastSeenSeconds: number;
  positionHistory: [number, number, number][];
}

export interface WeatherFrame {
  time: number;
  tileUrl: string;
}

export interface SourceHealth {
  status: SourceStatus;
  source: string;
  updatedAt: string | null;
  message?: string;
  requestCount?: number;
  requestLimit?: number;
}

export interface AtlasStatus {
  service: 'aerogrid-3d';
  version: string;
  revision?: string;
  status: 'ok' | 'degraded';
  time: string;
  sources: {
    flights: SourceHealth;
    weather: SourceHealth;
  };
}

export const LIVE_STALE_AFTER_MS = 60_000;
export const LIVE_UNAVAILABLE_AFTER_MS = 5 * 60_000;

export function statusForAge(
  generatedAt: string,
  nowMs = Date.now(),
): Extract<SourceStatus, 'available' | 'stale' | 'unavailable'> {
  const generatedMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedMs)) return 'unavailable';
  const age = Math.max(0, nowMs - generatedMs);
  if (age <= LIVE_STALE_AFTER_MS) return 'available';
  if (age <= LIVE_UNAVAILABLE_AFTER_MS) return 'stale';
  return 'unavailable';
}

export function isTrustedLiveSnapshot<T>(snapshot: DataSnapshot<T>): boolean {
  return snapshot.mode === 'live-beta'
    && snapshot.source !== 'demo'
    && snapshot.status !== 'unavailable';
}
