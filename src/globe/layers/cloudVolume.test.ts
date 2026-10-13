import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_KM, lonLatToVector } from '../geo';
import { cloudHalfHeight, intersectCloud } from './cloudVolume';

describe('physical cloud volumes', () => {
  it('keeps even wide low clouds above the globe at equator and poles', () => {
    for (const latitude of [-90, -60, 0, 60, 90]) {
      for (const altitude of [1, 2, 6, 15]) {
        const center = lonLatToVector(140, latitude, altitude);
        const halfHeight = cloudHalfHeight(altitude, 260);
        expect(center.length() - halfHeight).toBeGreaterThan(EARTH_RADIUS_KM);
        expect(halfHeight).toBeLessThanOrEqual(4);
      }
    }
  });
  it('intersects an oblique cloud volume above the surface, and permits inside views', () => {
    const center = new Vector3(0, 0, EARTH_RADIUS_KM + 2);
    for (const x of [0, 30, 100]) {
      const origin = center.clone().add(new Vector3(x, 0, 10));
      const ray = center.clone().sub(origin).normalize();
      const interval = intersectCloud(origin, ray, center, 260)!;
      expect(interval).not.toBeNull();
      const hit = origin.clone().addScaledVector(ray, interval[0]);
      expect(hit.length()).toBeGreaterThan(EARTH_RADIUS_KM);
    }
    expect(intersectCloud(center, new Vector3(1, 0, 0), center, 260)?.[0]).toBe(0);
    expect(intersectCloud(center.clone().add(new Vector3(300, 0, 0)), new Vector3(1, 0, 0), center, 260)).toBeNull();
  });
});
