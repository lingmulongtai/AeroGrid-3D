export type QualityPreset = 'low' | 'medium' | 'high';

export type QualitySettings = {
  preset: QualityPreset;
  dpr: number;
  maxFlights: number;
  weatherParticles: number;
  globeResolution: number;
  tileCacheScale: number;
};

export const QUALITY_PRESETS: Record<QualityPreset, QualitySettings> = {
  low: {
    preset: 'low',
    dpr: 1.0,
    maxFlights: 800,
    weatherParticles: 800,
    globeResolution: 3,
    tileCacheScale: 0.8,
  },
  medium: {
    preset: 'medium',
    dpr: 1.8,
    maxFlights: 2000,
    weatherParticles: 1800,
    globeResolution: 1,
    tileCacheScale: 1.2,
  },
  high: {
    preset: 'high',
    dpr: 2.0,
    maxFlights: 2400,
    weatherParticles: 2600,
    globeResolution: 1,
    tileCacheScale: 1.4,
  },
};

export const DEFAULT_QUALITY = QUALITY_PRESETS.medium;
