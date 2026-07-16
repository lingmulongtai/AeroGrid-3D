import { describe, expect, it } from 'vitest';
import {
  MAX_GLOBE_ZOOM,
  MIN_GLOBE_ZOOM,
  getAdaptiveGlobeResolution,
  normalizeGlobeViewState,
  zoomGlobeView,
} from './useAdvancedGlobeCamera';

describe('globe camera', () => {
  it('keeps zoom below the GlobeView projection switch', () => {
    const result = normalizeGlobeViewState({ longitude: 540, latitude: 92, zoom: 20 });

    expect(result).toMatchObject({
      longitude: -180,
      latitude: 85,
      zoom: MAX_GLOBE_ZOOM,
      minZoom: MIN_GLOBE_ZOOM,
      maxZoom: MAX_GLOBE_ZOOM,
    });
  });

  it('zooms without moving the geographic center', () => {
    const result = zoomGlobeView({ longitude: 139.76, latitude: 35.68, zoom: 4 }, 0.8);

    expect(result.longitude).toBe(139.76);
    expect(result.latitude).toBe(35.68);
    expect(result.zoom).toBeCloseTo(4.8);
  });

  it('increases globe tessellation as the camera approaches the surface', () => {
    expect(getAdaptiveGlobeResolution(1, 3)).toBe(1);
    expect(getAdaptiveGlobeResolution(5, 1)).toBe(0.2);
    expect(getAdaptiveGlobeResolution(11, 1)).toBe(0.04);
  });
});
