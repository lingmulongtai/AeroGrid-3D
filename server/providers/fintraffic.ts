import type { ShipRecord, PublicCamera } from '../../shared/live.js';
import { ProviderError } from './errors.js';

export async function fetchFintrafficShips(fetchFn = fetch, nowMs = Date.now()): Promise<ShipRecord[]> {
  const response = await fetchFn('https://meri.digitraffic.fi/api/ais/v1/locations', { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new ProviderError(`Fintraffic AIS returned HTTP ${response.status}`, response.status);
  const payload = await response.json();
  if (!Array.isArray(payload.features)) throw new ProviderError('Fintraffic returned invalid vessel data');
  return payload.features.flatMap((feature: any) => {
    const p = feature.properties;
    const [longitude, latitude] = feature.geometry?.coordinates ?? [];
    if (!p || !Number.isFinite(longitude) || !Number.isFinite(latitude) || !Number.isFinite(p.timestampExternal)
      || nowMs - p.timestampExternal > 5 * 60_000 || p.timestampExternal > nowMs + 60_000) return [];
    return [{ id: String(p.mmsi), name: `MMSI ${p.mmsi}`, longitude, latitude, heading: p.heading < 360 ? p.heading : p.cog < 360 ? p.cog : 0, speedKnots: p.sog < 102.3 ? p.sog : 0, receivedAt: new Date(p.timestampExternal).toISOString(), source: 'fintraffic' as const }];
  });
}
export async function fetchPublicCameras(fetchFn = fetch): Promise<PublicCamera[]> {
  const response = await fetchFn('https://tie.digitraffic.fi/api/weathercam/v1/stations', { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new ProviderError(`Fintraffic cameras returned HTTP ${response.status}`, response.status);
  const payload = await response.json();
  if (!Array.isArray(payload.features)) throw new ProviderError('Fintraffic returned invalid camera data');
  return payload.features.flatMap((feature: any) => {
    const p = feature.properties;
    const [longitude, latitude] = feature.geometry?.coordinates ?? [];
    const preset = p?.presets?.find((item: any) => /^C\d{7}$/.test(item.id));
    if (!preset || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
    return [{ id: p.id, name: p.nameEn ?? p.name ?? p.id, longitude, latitude, imageUrl: `https://weathercam.digitraffic.fi/${preset.id}.jpg`, pageUrl: 'https://liikennetilanne.fintraffic.fi/', source: 'fintraffic' as const }];
  });
}
