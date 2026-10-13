import { Vector3 } from 'three';
import { EARTH_RADIUS_KM } from '../geo';

/** Vertical extent is independent of the horizontal weather-system footprint. */
export function cloudHalfHeight(altitudeKm: number, widthKm: number): number {
  return Math.max(0.01, Math.min(4, widthKm * 0.025, altitudeKm - 0.05));
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
