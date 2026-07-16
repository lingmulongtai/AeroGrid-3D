import {describe, expect, it} from 'vitest';
import {getSatelliteOrbitPath, getSatellitePreview} from './satellites';

describe('deterministic satellite preview', () => {
  it('produces stable bounded orbital positions', () => {
    const time = Date.UTC(2026, 6, 17, 0, 0, 0);
    const first = getSatellitePreview(time);
    const second = getSatellitePreview(time);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(18);
    expect(first.every((satellite) => satellite.longitude >= -180 && satellite.longitude <= 180)).toBe(true);
    expect(first.every((satellite) => satellite.latitude >= -90 && satellite.latitude <= 90)).toBe(true);
    expect(first.every((satellite) => satellite.altitude >= 400_000)).toBe(true);
  });

  it('builds a full sampled orbit for the 3D path layer', () => {
    const [satellite] = getSatellitePreview(0);
    const path = getSatelliteOrbitPath(satellite, 0, 48);
    expect(path).toHaveLength(49);
    expect(path.every((point) => point[2] === satellite.altitude)).toBe(true);
  });
});
