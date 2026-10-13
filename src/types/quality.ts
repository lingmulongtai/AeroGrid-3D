export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

export type QualitySettings = {
  preset: QualityPreset | 'custom';
  /** Upper bound for the device pixel ratio used by the WebGL canvas. */
  maxPixelRatio: number;
  /** Multisample anti-aliasing sample count; 0 disables it. */
  msaa: 0 | 2 | 4 | 8;
  bloom: boolean;
  /** Screen-space tile error budget; lower values load sharper imagery. */
  tileDetail: number;
  maxTiles: number;
  tileConcurrency: number;
  anisotropy: number;
  atmosphereSteps: number;
  maxFlights: number;
  maxSatellites: number;
  weatherParticles: number;
};

export const QUALITY_PRESETS: Record<QualityPreset, QualitySettings> = {
  low: {
    preset: 'low',
    maxPixelRatio: 1,
    msaa: 0,
    bloom: false,
    tileDetail: 1.6,
    maxTiles: 220,
    tileConcurrency: 6,
    anisotropy: 2,
    atmosphereSteps: 8,
    maxFlights: 600,
    maxSatellites: 300,
    weatherParticles: 4_000,
  },
  medium: {
    preset: 'medium',
    maxPixelRatio: 1.5,
    msaa: 4,
    bloom: true,
    tileDetail: 1.15,
    maxTiles: 420,
    tileConcurrency: 10,
    anisotropy: 8,
    atmosphereSteps: 12,
    maxFlights: 1_500,
    maxSatellites: 1_200,
    weatherParticles: 10_000,
  },
  high: {
    preset: 'high',
    maxPixelRatio: 2,
    msaa: 4,
    bloom: true,
    tileDetail: 0.95,
    maxTiles: 640,
    tileConcurrency: 14,
    anisotropy: 16,
    atmosphereSteps: 16,
    maxFlights: 2_500,
    maxSatellites: 2_400,
    weatherParticles: 18_000,
  },
  ultra: {
    preset: 'ultra',
    maxPixelRatio: 3,
    msaa: 8,
    bloom: true,
    tileDetail: 0.75,
    maxTiles: 900,
    tileConcurrency: 18,
    anisotropy: 16,
    atmosphereSteps: 24,
    maxFlights: 4_000,
    maxSatellites: 4_200,
    weatherParticles: 30_000,
  },
};

export const DEFAULT_QUALITY = QUALITY_PRESETS.high;

const STORAGE_KEY = 'aerogrid.quality';

export function loadQuality(fallback: QualitySettings): QualitySettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<QualitySettings>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

export function saveQuality(quality: QualitySettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(quality));
  } catch {
    // Storage can be unavailable in private browsing; settings stay in memory.
  }
}
