import {describe, expect, it} from 'vitest';
import {terrainModeForView} from './terrain';

describe('adaptive globe terrain', () => {
  it('uses a complete ellipsoid for orbital and polar views', () => {
    expect(terrainModeForView({height: 15_500_000, latitude: 35, detailedTerrainAvailable: true}))
      .toBe('ellipsoid');
    expect(terrainModeForView({height: 500_000, latitude: 89, detailedTerrainAvailable: true}))
      .toBe('ellipsoid');
    expect(terrainModeForView({height: 500_000, latitude: -89, detailedTerrainAvailable: true}))
      .toBe('ellipsoid');
  });

  it('enables detailed relief for close non-polar exploration', () => {
    expect(terrainModeForView({height: 750_000, latitude: 35, detailedTerrainAvailable: true}))
      .toBe('terrain');
  });
});
