import { Vector3 } from 'three';

// World units are kilometres. The Earth is centred at the origin with +Y
// towards the north pole, +Z through (0°, 0°) and +X through (0°, 90°E).
export const EARTH_RADIUS_KM = 6371;
export const DEG = Math.PI / 180;

export function wrapLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

export function lonLatToVector(longitude: number, latitude: number, altitudeKm = 0, target = new Vector3()): Vector3 {
  const lon = longitude * DEG;
  const lat = latitude * DEG;
  const radius = EARTH_RADIUS_KM + altitudeKm;
  const cosLat = Math.cos(lat);
  return target.set(radius * cosLat * Math.sin(lon), radius * Math.sin(lat), radius * cosLat * Math.cos(lon));
}

export function vectorToLonLat(vector: Vector3): { longitude: number; latitude: number; altitudeKm: number } {
  const radius = vector.length();
  return {
    longitude: Math.atan2(vector.x, vector.z) / DEG,
    latitude: Math.asin(Math.max(-1, Math.min(1, vector.y / radius))) / DEG,
    altitudeKm: radius - EARTH_RADIUS_KM,
  };
}

/** Local east / north / up unit vectors at a geographic position. */
export function enuFrame(longitude: number, latitude: number) {
  const up = lonLatToVector(longitude, latitude, 0).normalize();
  const lon = longitude * DEG;
  const east = new Vector3(Math.cos(lon), 0, -Math.sin(lon));
  const north = new Vector3().crossVectors(up, east).normalize();
  return { east, north, up };
}

/** Advance a position along a great circle by distanceKm on bearing (degrees). */
export function destinationPoint(longitude: number, latitude: number, bearing: number, distanceKm: number): [number, number] {
  const delta = distanceKm / EARTH_RADIUS_KM;
  const theta = bearing * DEG;
  const lat1 = latitude * DEG;
  const lon1 = longitude * DEG;
  const sinLat2 = Math.sin(lat1) * Math.cos(delta) + Math.cos(lat1) * Math.sin(delta) * Math.cos(theta);
  const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)));
  const lon2 = lon1 + Math.atan2(
    Math.sin(theta) * Math.sin(delta) * Math.cos(lat1),
    Math.cos(delta) - Math.sin(lat1) * sinLat2,
  );
  return [wrapLongitude(lon2 / DEG), lat2 / DEG];
}

export function greatCircleKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function mercatorYToLatitude(normalizedY: number): number {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * normalizedY))) / DEG;
}

export const MERCATOR_MAX_LATITUDE = mercatorYToLatitude(0);
