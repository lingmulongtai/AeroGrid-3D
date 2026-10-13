import type { CloudProfile } from '../../shared/live.js';
import type { FlightQuery } from '../services/atlasData.js';
import { ProviderError } from './errors.js';

export const PRESSURE_LEVELS = [1000, 925, 850, 700, 500, 300];
interface GfsResponse {
  latitude: number; longitude: number; elevation: number;
  hourly: Record<string, Array<number | null>>;
}
export function normalizeCloudProfile(raw: GfsResponse, nowMs: number, footprintKm: number): CloudProfile {
  const times = raw.hourly?.time;
  if (!Array.isArray(times) || !times.length) throw new ProviderError('GFS returned no forecast times');
  const index = times.reduce<number>((best, time, i) => time !== null && Math.abs(time * 1000 - nowMs) < Math.abs((times[best] ?? 0) * 1000 - nowMs) ? i : best, 0);
  if (Math.abs(times[index]! * 1000 - nowMs) > 90 * 60_000) throw new ProviderError('GFS returned an outdated forecast');
  const groundAltitudeKm = Math.max(0, raw.elevation / 1000);
  const surfacePressure = raw.hourly.surface_pressure?.[index];
  if (!Number.isFinite(surfacePressure)) throw new ProviderError('GFS returned no surface pressure');
  const levels = PRESSURE_LEVELS.flatMap((pressureHpa) => {
    const altitude = raw.hourly[`geopotential_height_${pressureHpa}hPa`]?.[index];
    const coverPercent = raw.hourly[`cloud_cover_${pressureHpa}hPa`]?.[index];
    if (altitude === null || coverPercent === null || !Number.isFinite(altitude) || !Number.isFinite(coverPercent)) return [];
    const altitudeKm = altitude! / 1000;
    if (pressureHpa > surfacePressure! || altitudeKm <= groundAltitudeKm + 0.05) return [];
    return [{ pressureHpa, altitudeKm, coverPercent: Math.max(0, Math.min(100, coverPercent!)) }];
  });
  return { latitude: raw.latitude, longitude: raw.longitude, validTime: new Date(times[index]! * 1000).toISOString(), groundAltitudeKm, footprintKm, levels };
}
export async function fetchCloudProfiles(query: FlightQuery, fetchFn = fetch, nowMs = Date.now()): Promise<CloudProfile[]> {
  const radiusKm = query.radiusNm * 1.852;
  const latStep = radiusKm / 111.2;
  const lonStep = latStep / Math.max(0.1, Math.cos(query.latitude * Math.PI / 180));
  const coords = [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((x) => ({
    lat: Math.max(-89, Math.min(89, query.latitude + y * latStep)),
    lon: ((query.longitude + x * lonStep + 540) % 360) - 180,
  })));
  const hourly = ['surface_pressure', ...PRESSURE_LEVELS.flatMap((level) => [`cloud_cover_${level}hPa`, `geopotential_height_${level}hPa`])];
  const params = new URLSearchParams({ latitude: coords.map((c) => c.lat.toFixed(3)).join(','), longitude: coords.map((c) => c.lon.toFixed(3)).join(','), hourly: hourly.join(','), models: 'gfs_global', forecast_hours: '3', past_hours: '1', timezone: 'GMT', timeformat: 'unixtime', cell_selection: 'nearest' });
  const response = await fetchFn(`https://api.open-meteo.com/v1/gfs?${params}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new ProviderError(`GFS returned HTTP ${response.status}`, response.status);
  const payload = await response.json() as GfsResponse[];
  if (!Array.isArray(payload) || payload.length !== coords.length) throw new ProviderError('GFS returned incomplete grid');
  return payload.map((p) => normalizeCloudProfile(p, nowMs, radiusKm));
}
