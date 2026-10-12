import { describe, expect, it } from 'vitest';
import { buildConstellation, satelliteState, satelliteWorldPosition } from './satellites';

describe('demo satellite constellation', () => {
  it('is deterministic and respects the requested limit', () => {
    const first = buildConstellation(800);
    expect(first).toHaveLength(800);
    expect(buildConstellation(800)).toBe(first);
    expect(first[0].name).toBe('ISS');
    expect(new Set(first.map((satellite) => satellite.id)).size).toBe(first.length);
  });

  it('propagates orbits at their nominal altitude and orbital speed', () => {
    const time = Date.UTC(2026, 6, 17, 0, 0, 0);
    for (const satellite of buildConstellation(400)) {
      const state = satelliteState(satellite, time);
      expect(state.altitudeKm).toBeCloseTo(satellite.altitudeKm, 3);
      expect(Math.abs(state.latitude)).toBeLessThanOrEqual(Math.min(90, satellite.inclination > 90 ? 180 - satellite.inclination : satellite.inclination) + 1e-6);
      expect(state.longitude).toBeGreaterThanOrEqual(-180);
      expect(state.longitude).toBeLessThanOrEqual(180);
    }
    const iss = satelliteState(buildConstellation(10)[0], time);
    expect(iss.speedKmS).toBeGreaterThan(7.5);
    expect(iss.speedKmS).toBeLessThan(7.8);
  });

  it('keeps geostationary satellites fixed above the Earth', () => {
    const geo = buildConstellation(400).find((satellite) => satellite.category === 'geostationary')!;
    const a = satelliteState(geo, Date.UTC(2026, 3, 1, 0));
    const b = satelliteState(geo, Date.UTC(2026, 3, 1, 6));
    expect(Math.abs(a.longitude - b.longitude)).toBeLessThan(0.5);
    expect(Math.abs(a.latitude)).toBeLessThan(0.2);
  });

  it('returns Earth-fixed world coordinates in kilometres', () => {
    const position = satelliteWorldPosition(buildConstellation(10)[0], 0, 0, { x: 0, y: 0, z: 0 });
    expect(Math.hypot(position.x, position.y, position.z)).toBeCloseTo(6371 + 418, 3);
  });
});
