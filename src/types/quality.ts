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
    maxFlights: 800,
    maxSatellites: 300,
    weatherParticles: 2000,
    globeResolution: 3,
    tileCacheScale: 0.8,
  },
  medium: {
    preset: 'medium',
    dpr: 1.5,
    maxFlights: 1600,
    maxSatellites: 900,
    weatherParticles: 6000,
    globeResolution: 2,
    tileCacheScale: 1.0,
  },
  high: {
    preset: 'high',
    dpr: 2.0,
    maxFlights: 3000,
    maxSatellites: 2500,
    weatherParticles: 12000,
    globeResolution: 1,
    tileCacheScale: 1.4,
  },
};

export const DEFAULT_QUALITY = QUALITY_PRESETS.high;
