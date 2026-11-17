import type { ShipRecord, PublicCamera } from '../../shared/live.js';
import { ProviderError } from './errors.js';

function coordinates(feature: any): [number, number] | null {
  const value = feature?.geometry?.coordinates;
  if (!Array.isArray(value)) return null;
  const [longitude, latitude] = value;
  return Number.isFinite(longitude) && Math.abs(longitude) <= 180
    && Number.isFinite(latitude) && Math.abs(latitude) <= 90 ? [longitude, latitude] : null;
}
const validHeading = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 360;

export async function fetchFintrafficShips(fetchFn = fetch, nowMs = Date.now()): Promise<ShipRecord[]> {
  const response = await fetchFn('https://meri.digitraffic.fi/api/ais/v1/locations', { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new ProviderError(`Fintraffic AIS returned HTTP ${response.status}`, response.status);
  const payload = await response.json();
  if (!Array.isArray(payload?.features)) throw new ProviderError('Fintraffic returned invalid vessel data');
  return payload.features.flatMap((feature: any) => {
    const p = feature?.properties;
    const point = coordinates(feature);
    // Discard a corrupt row rather than failing the entire regional feed.
    if (!p || !point || !Number.isInteger(p.mmsi) || p.mmsi <= 0 || p.mmsi > 999999999
      || !Number.isFinite(p.timestampExternal) || nowMs - p.timestampExternal > 5 * 60_000
      || p.timestampExternal > nowMs + 60_000) return [];
    const [longitude, latitude] = point;
    return [{ id: String(p.mmsi), name: `MMSI ${p.mmsi}`, longitude, latitude,
      heading: validHeading(p.heading) ? p.heading : validHeading(p.cog) ? p.cog : 0,
      speedKnots: Number.isFinite(p.sog) && p.sog >= 0 && p.sog < 102.3 ? p.sog : 0,
      receivedAt: new Date(p.timestampExternal).toISOString(), source: 'fintraffic' as const }];
  });
}
export async function fetchPublicCameras(fetchFn = fetch): Promise<PublicCamera[]> {
  const response = await fetchFn('https://tie.digitraffic.fi/api/weathercam/v1/stations', { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new ProviderError(`Fintraffic cameras returned HTTP ${response.status}`, response.status);
  const payload = await response.json();
  if (!Array.isArray(payload?.features)) throw new ProviderError('Fintraffic returned invalid camera data');
  return payload.features.flatMap((feature: any) => {
    const p = feature?.properties;
    const point = coordinates(feature);
    const preset = Array.isArray(p?.presets) ? p.presets.find((item: any) => typeof item?.id === 'string' && /^C\d{7}$/.test(item.id)) : undefined;
    if (!preset || !point || typeof p.id !== 'string' || !p.id.trim()) return [];
    const [longitude, latitude] = point;
    return [{ id: p.id, name: p.nameEn ?? p.name ?? p.id, longitude, latitude, imageUrl: `https://weathercam.digitraffic.fi/${preset.id}.jpg`, pageUrl: 'https://liikennetilanne.fintraffic.fi/', source: 'fintraffic' as const }];
  });
}
