import type { FlightCategory, FlightRecord } from '../../shared/contracts.js';
import { ProviderError } from './errors.js';

const AIRPLANES_LIVE_BASE_URL = 'https://api.airplanes.live/v2/point';
const FEET_TO_METERS = 0.3048;
const KNOTS_TO_METERS_PER_SECOND = 0.514444;
const FEET_PER_MINUTE_TO_METERS_PER_SECOND = 0.00508;

type FetchLike = typeof fetch;

interface AirplanesLiveAircraft {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  desc?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | 'ground';
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  geom_rate?: number;
  category?: string;
  seen?: number;
}

interface AirplanesLiveResponse {
  ac?: AirplanesLiveAircraft[];
  now?: number;
  msg?: string;
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function categoryFromCode(code?: string): FlightCategory {
  const categories: Record<string, FlightCategory> = {
    A1: 'light',
    A2: 'small',
    A3: 'medium',
    A4: 'large',
    A5: 'heavy',
    A6: 'high_performance',
    A7: 'rotorcraft',
  };
  return categories[code ?? ''] ?? 'medium';
}

export function normalizeAirplanesLiveAircraft(raw: AirplanesLiveAircraft): FlightRecord | null {
  if (!raw.hex || !Number.isFinite(raw.lat) || !Number.isFinite(raw.lon)) return null;

  const onGround = raw.alt_baro === 'ground';
  const altitudeFeet = onGround ? 0 : finite(raw.alt_baro, finite(raw.alt_geom));
  const verticalRateFpm = finite(raw.baro_rate, finite(raw.geom_rate));

  return {
    id: raw.hex.toLowerCase(),
    callsign: raw.flight?.trim() || raw.r?.trim() || raw.hex.toUpperCase(),
    registration: raw.r?.trim() || undefined,
    aircraftType: raw.t?.trim() || raw.desc?.trim() || undefined,
    longitude: raw.lon as number,
    latitude: raw.lat as number,
    altitude: altitudeFeet * FEET_TO_METERS,
    velocity: finite(raw.gs) * KNOTS_TO_METERS_PER_SECOND,
    heading: finite(raw.track),
    verticalRate: verticalRateFpm * FEET_PER_MINUTE_TO_METERS_PER_SECOND,
    onGround,
    category: categoryFromCode(raw.category),
    lastSeenSeconds: Math.max(0, finite(raw.seen)),
    positionHistory: [[raw.lon as number, raw.lat as number, altitudeFeet * FEET_TO_METERS]],
  };
}

export class AirplanesLiveProvider {
  constructor(private readonly fetchFn: FetchLike = fetch) {}

  async fetchFlights(
    latitude: number,
    longitude: number,
    radiusNm: number,
  ): Promise<{ items: FlightRecord[]; generatedAtMs: number }> {
    const url = `${AIRPLANES_LIVE_BASE_URL}/${latitude.toFixed(4)}/${longitude.toFixed(4)}/${Math.round(radiusNm)}`;
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        headers: { 'User-Agent': 'AeroGrid-3D/0.1 (non-commercial public beta)' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new ProviderError(`Flight provider request failed: ${(error as Error).message}`);
    }

    if (!response.ok) {
      const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
      throw new ProviderError(
        `Flight provider returned HTTP ${response.status}`,
        response.status,
        Number.isFinite(retryAfter) ? retryAfter : undefined,
      );
    }

    let payload: AirplanesLiveResponse;
    try {
      payload = await response.json() as AirplanesLiveResponse;
    } catch {
      throw new ProviderError('Flight provider returned invalid JSON');
    }

    const items = (payload.ac ?? [])
      .map(normalizeAirplanesLiveAircraft)
      .filter((item): item is FlightRecord => item !== null);

    return {
      items,
      generatedAtMs: Number.isFinite(payload.now) ? payload.now as number : Date.now(),
    };
  }
}
