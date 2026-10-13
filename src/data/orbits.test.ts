import { describe, expect, it } from 'vitest';
import { constellationFromElements, satelliteState } from './satellites';
const elements = { OBJECT_NAME: 'ISS', OBJECT_ID: '1998-067A', ELEMENT_SET_NO: 999, NORAD_CAT_ID: 25544, EPOCH: '2026-10-13T00:00:00', MEAN_MOTION: 15.5, ECCENTRICITY: 0.0003, INCLINATION: 51.64, RA_OF_ASC_NODE: 32, ARG_OF_PERICENTER: 10, MEAN_ANOMALY: 50, BSTAR: 0.0001, MEAN_MOTION_DOT: 0.0001, MEAN_MOTION_DDOT: 0 };
describe('observed orbital elements', () => {
  it('propagates ISS at physical geodetic altitude, rather than the demo phase', () => {
    const now = Date.UTC(2026, 9, 13, 6);
    const records = constellationFromElements([elements], 1, now);
    const state = satelliteState(records[0], now);
    expect(records[0].id).toBe('norad-25544');
    expect(state.altitudeKm).toBeGreaterThan(350); expect(state.altitudeKm).toBeLessThan(500);
    expect(Math.abs(state.latitude)).toBeLessThan(52);
    expect(state.speedKmS).toBeGreaterThan(7); expect(state.speedKmS).toBeLessThan(8);
    expect(satelliteState(records[0], now + 20 * 60_000).longitude).not.toBeCloseTo(state.longitude, 0);
  });
  it('omits old elements and never inserts synthetic constellations on failure', () => {
    expect(constellationFromElements([], 100)).toEqual([]);
    expect(constellationFromElements([elements], 100, Date.UTC(2026, 10, 1))).toEqual([]);
  });
});
