import { describe, expect, it } from 'vitest';
import { areaIntersectsBounds, FINTRAFFIC_CAMERA_BOUNDS, FINTRAFFIC_SHIP_BOUNDS, greatCircleKm } from './geography';

describe('regional request coverage', () => {
  it('includes Finland and circles intersecting the boundary, excluding Tokyo and distant views', () => {
    for (const bounds of [FINTRAFFIC_SHIP_BOUNDS, FINTRAFFIC_CAMERA_BOUNDS]) {
      expect(areaIntersectsBounds({ latitude: 60.17, longitude: 24.94, radiusNm: 20 }, bounds)).toBe(true);
      expect(areaIntersectsBounds({ latitude: 35.68, longitude: 139.76, radiusNm: 250 }, bounds)).toBe(false);
      expect(areaIntersectsBounds({ latitude: 0, longitude: 180, radiusNm: 250 }, bounds)).toBe(false);
    }
    expect(areaIntersectsBounds({ latitude: 58.8, longitude: 25, radiusNm: 20 }, FINTRAFFIC_CAMERA_BOUNDS)).toBe(true);
    expect(areaIntersectsBounds({ latitude: 58.8, longitude: 25, radiusNm: 5 }, FINTRAFFIC_CAMERA_BOUNDS)).toBe(false);
  });
  it('handles a circle tangent to a corner and longitude wrapping', () => {
    const query = { latitude: 57, longitude: 17, radiusNm: 1 };
    const distance = greatCircleKm(query, { latitude: 59, longitude: 19 });
    expect(areaIntersectsBounds({ ...query, radiusNm: distance / 1.852 }, FINTRAFFIC_CAMERA_BOUNDS)).toBe(true);
    expect(areaIntersectsBounds({ ...query, radiusNm: (distance - 1) / 1.852 }, FINTRAFFIC_CAMERA_BOUNDS)).toBe(false);
    expect(greatCircleKm({ latitude: 0, longitude: 179.9 }, { latitude: 0, longitude: -179.9 })).toBeCloseTo(22.239, 2);
  });
});
