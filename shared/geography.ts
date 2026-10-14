export interface AreaQuery { latitude: number; longitude: number; radiusNm: number }
export interface GeoBounds { south: number; north: number; west: number; east: number }
const RAD = Math.PI / 180;
const EARTH_KM = 6371;

// Conservative request gates, not guarantees of receiver coverage. Official scope:
// https://www.digitraffic.fi/en/marine-traffic/ and /en/road-traffic/ (Finnish roads).
// One 2026-10-15 sample: 602 recent ships at 57.67..65.80 N, 18.44..32.53 E;
// 813 camera stations at 59.86..70.09 N, 19.62..31.28 E. Pad the Finnish/Baltic
// envelope rather than tightening the gates to one changing data distribution.
export const FINTRAFFIC_SHIP_BOUNDS: GeoBounds = { south: 53, north: 70, west: 9, east: 33 };
export const FINTRAFFIC_CAMERA_BOUNDS: GeoBounds = { south: 59, north: 71, west: 19, east: 32 };

export function greatCircleKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const h = Math.sin((a.latitude - b.latitude) * RAD / 2) ** 2
    + Math.cos(a.latitude * RAD) * Math.cos(b.latitude * RAD) * Math.sin((a.longitude - b.longitude) * RAD / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

/** Exact spherical circle vs lat/lon rectangle test (non-wrapping bounds). */
export function areaIntersectsBounds(query: AreaQuery, bounds: GeoBounds): boolean {
  const phi = query.latitude * RAD;
  const delta = query.longitude >= bounds.west && query.longitude <= bounds.east ? 0
    : Math.min(...[bounds.west, bounds.east].map((lon) => Math.acos(Math.cos((query.longitude - lon) * RAD))));
  // Maximize the dot product along the nearest rectangle meridian. Clamping
  // both coordinates alone misses near-tangent circles at high latitudes.
  const south = bounds.south * RAD, north = bounds.north * RAD;
  const dot = (latitude: number) => Math.sin(phi) * Math.sin(latitude) + Math.cos(phi) * Math.cos(latitude) * Math.cos(delta);
  const peak = Math.atan2(Math.sin(phi), Math.cos(phi) * Math.cos(delta));
  const best = Math.max(dot(south), dot(north), peak >= south && peak <= north ? dot(peak) : -1);
  return Math.acos(Math.max(-1, Math.min(1, best))) * EARTH_KM <= query.radiusNm * 1.852 + 1e-7;
}
