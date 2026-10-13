import type { FlightCategory, FlightRecord } from '../../shared/contracts.js';
import { ProviderError } from './errors.js';

const AIRPLANES_LIVE_BASE_URL = 'https://api.airplanes.live/v2/point';
const FEET_TO_METERS = 0.3048;
const KNOTS_TO_METERS_PER_SECOND = 0.514444;
const FEET_PER_MINUTE_TO_METERS_PER_SECOND = 0.00508;

type FetchLike = typeof fetch;
type Sleep = (milliseconds: number) => Promise<void>;

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
  seen_pos?: number;
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
  if (Math.abs(raw.lat!) > 90 || Math.abs(raw.lon!) > 180 || finite(raw.seen_pos, finite(raw.seen)) > 120) return null;

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
    lastSeenSeconds: Math.max(0, finite(raw.seen_pos, finite(raw.seen))),
    positionHistory: [[raw.lon as number, raw.lat as number, altitudeFeet * FEET_TO_METERS]],
  };
}

export class AirplanesLiveProvider {
  private readonly lifetime = new AbortController();
  private requestQueue: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;

  constructor(
    private readonly fetchFn: FetchLike = fetch,
    private readonly now: () => number = Date.now,
    private readonly sleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    private readonly config: { source: 'airplanes.live' | 'adsb.lol' | 'adsbexchange'; apiKey?: string } = { source: 'airplanes.live' },
  ) {}
  dispose() { this.lifetime.abort(); this.config.apiKey = undefined; }

  async fetchFlights(
    latitude: number,
    longitude: number,
    radiusNm: number,
  ): Promise<{ items: FlightRecord[]; generatedAtMs: number }> {
    if (this.lifetime.signal.aborted) throw new ProviderError('Provider connection closed');
    const request = this.requestQueue.then(() => this.performRequest(latitude, longitude, radiusNm));
    this.requestQueue = request.then(() => undefined, () => undefined);
    return request;
  }

  private async performRequest(
    latitude: number,
    longitude: number,
    radiusNm: number,
  ): Promise<{ items: FlightRecord[]; generatedAtMs: number }> {
    const waitMs = Math.max(0, this.nextRequestAt - this.now());
    if (waitMs > 0) await this.sleep(waitMs);
    if (this.lifetime.signal.aborted) throw new ProviderError('Provider connection closed');
    this.nextRequestAt = this.now() + 1_000;

    const lat = latitude.toFixed(4);
    const lon = longitude.toFixed(4);
    const radius = Math.round(radiusNm);
    const host = 'adsbexchange-com1.p.rapidapi.com';
    const url = this.config.source === 'adsb.lol'
      ? `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${radius}`
      : this.config.source === 'adsbexchange'
        ? `https://${host}/v2/lat/${lat}/lon/${lon}/dist/${radius}/`
        : `${AIRPLANES_LIVE_BASE_URL}/${lat}/${lon}/${radius}`;
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        headers: {
          'User-Agent': 'AeroGrid-3D/0.1 (non-commercial public beta)',
          ...(this.config.source === 'adsbexchange' ? { 'X-RapidAPI-Key': this.config.apiKey ?? '', 'X-RapidAPI-Host': host } : {}),
        },
        signal: AbortSignal.any([AbortSignal.timeout(10_000), this.lifetime.signal]),
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

    if (!Array.isArray(payload.ac)) throw new ProviderError('Flight provider returned no aircraft array');
    const items = payload.ac
      .map(normalizeAirplanesLiveAircraft)
      .filter((item): item is FlightRecord => item !== null);

    return {
      items,
      generatedAtMs: Number.isFinite(payload.now) ? (payload.now! < 100_000_000_000 ? payload.now! * 1000 : payload.now!) : this.now(),
    };
  }
}
