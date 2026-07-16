export type TerrainMode = 'ellipsoid' | 'terrain';

export const DETAILED_TERRAIN_LIMITS = {
  maximumCameraHeight: 3_000_000,
  maximumAbsoluteLatitude: 78,
} as const;

/**
 * ArcGIS terrain adds useful local relief but its edge tiles are not a safe
 * global globe shell. Orbital and polar views use the complete WGS84
 * ellipsoid; detailed terrain is enabled only where its extra resolution is
 * visible and coverage is reliable.
 */
export function terrainModeForView({
  height,
  latitude,
  detailedTerrainAvailable,
}: {
  height: number;
  latitude: number;
  detailedTerrainAvailable: boolean;
}): TerrainMode {
  if (!detailedTerrainAvailable) return 'ellipsoid';
  return height < DETAILED_TERRAIN_LIMITS.maximumCameraHeight
    && Math.abs(latitude) < DETAILED_TERRAIN_LIMITS.maximumAbsoluteLatitude
    ? 'terrain'
    : 'ellipsoid';
}
