import { describe, expect, it, vi } from 'vitest';
import { normalizeCloudProfile } from './cloudProfiles';
const now = Date.UTC(2026, 9, 13, 6);
describe('forecast cloud profiles', () => {
  it('uses pressure-level heights and excludes levels below the ground', () => {
    const profile = normalizeCloudProfile({ latitude: 35, longitude: 140, elevation: 900, hourly: {
      time: [now / 1000 - 3600, now / 1000], surface_pressure: [1010, 890],
      cloud_cover_1000hPa: [50, 100], geopotential_height_1000hPa: [100, 100],
      cloud_cover_925hPa: [50, 100], geopotential_height_925hPa: [800, 800],
      cloud_cover_850hPa: [50, 47], geopotential_height_850hPa: [1500, 1505],
    } }, now, 100);
    expect(profile.validTime).toBe(new Date(now).toISOString());
    expect(profile.levels).toEqual([{ pressureHpa: 850, altitudeKm: 1.505, coverPercent: 47 }]);
  });
});
