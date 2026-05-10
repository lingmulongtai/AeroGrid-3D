export type QualityPreset = 'low' | 'medium' | 'high';

export type QualitySettings = {
  preset: QualityPreset;
  dpr: number;
  maxFlights: number;
  maxSatellites: number;
  weatherParticles: number;
  globeResolution: number;
  tileCacheScale: number;
};

export const QUALITY_PRESETS: Record<QualityPreset, QualitySettings> = {
  low: {
    preset: 'low',
    dpr: 1.0,
    maxFlights: 1200,
    maxSatellites: 300,
    weatherParticles: 2400,
    globeResolution: 3,
    tileCacheScale: 0.8,
  },
  medium: {
    preset: 'medium',
    dpr: 1.8,
    maxFlights: 2200,
    maxSatellites: 900,
    weatherParticles: 7000,
    globeResolution: 1,
    tileCacheScale: 1.2,
  },
  high: {
    preset: 'high',
    dpr: 2.0,
    maxFlights: 3000,
    maxSatellites: 2500,
    weatherParticles: 10000,
    globeResolution: 1,
    tileCacheScale: 1.4,
  },
};

export const DEFAULT_QUALITY = QUALITY_PRESETS.medium;
