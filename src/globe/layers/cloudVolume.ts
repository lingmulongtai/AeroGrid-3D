import { Vector3 } from 'three';
import { EARTH_RADIUS_KM, wrapLongitude } from '../geo';

/** Vertical extent is independent of the horizontal weather-system footprint. */
export function cloudHalfHeight(altitudeKm: number, widthKm: number): number {
  return Math.max(0.01, Math.min(4, widthKm * 0.025, altitudeKm - 0.05));
}

/**
 * Closest forecast column to a point, in one pass. Longitude differences wrap at
 * the antimeridian and shrink with latitude, so a column across the date line
 * is not mistaken for one on the far side of the planet.
 */
export function nearestProfile<T extends { longitude: number; latitude: number }>(profiles: readonly T[], longitude: number, latitude: number): T | undefined {
  const eastScale = Math.cos(latitude * Math.PI / 180);
  let best: T | undefined;
  let bestDistance = Infinity;
  for (const profile of profiles) {
    const east = wrapLongitude(profile.longitude - longitude) * eastScale;
    const north = profile.latitude - latitude;
    const distance = east * east + north * north;
    if (distance < bestDistance) { bestDistance = distance; best = profile; }
  }
  return best;
}

/** Conservative NDC extent used by the cloud proxy, including perspective shift. */
export function cloudScreenExtent(centerInView: Vector3, normalInView: Vector3, horizontal: number, vertical: number, scaleX: number, scaleY: number) {
  const distance = -centerInView.z;
  const nearDepth = Math.max(0.001, distance - horizontal);
  const extent = (component: number, coordinate: number, scale: number) =>
    Math.sqrt(horizontal ** 2 * (1 - component ** 2) + vertical ** 2 * component ** 2) * scale / nearDepth
    + Math.abs(coordinate * scale / distance) * horizontal / nearDepth;
  return { x: extent(normalInView.x, centerInView.x, scaleX), y: extent(normalInView.y, centerInView.y, scaleY) };
}

/** CPU equivalent of the cloud shader's ellipsoid intersection, for geometry QA. */
export function intersectCloud(origin: Vector3, direction: Vector3, center: Vector3, widthKm: number) {
  const normal = center.clone().normalize();
  const horizontal = widthKm / 2;
  const vertical = cloudHalfHeight(center.length() - EARTH_RADIUS_KM, widthKm);
  const metric = (a: Vector3, b: Vector3) => a.dot(b) / horizontal ** 2
    + (1 / vertical ** 2 - 1 / horizontal ** 2) * a.dot(normal) * b.dot(normal);
  const offset = origin.clone().sub(center);
  const a = metric(direction, direction);
  const b = metric(offset, direction);
  const c = metric(offset, offset) - 1;
  const d = b * b - a * c;
  if (d < 0) return null;
  const enter = (-b - Math.sqrt(d)) / a;
  const exit = (-b + Math.sqrt(d)) / a;
  return exit > 0 ? [Math.max(0, enter), exit] : null;
}
