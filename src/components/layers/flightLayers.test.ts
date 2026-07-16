import { describe, expect, it } from 'vitest';
import { getAircraftOrientation, getAircraftScaleForZoom } from './flightLayers';

describe('aircraft presentation', () => {
  it('keeps aircraft legible from orbit without letting close models explode in size', () => {
    expect(getAircraftScaleForZoom('medium', 1.5)).toBe(1_500);
    expect(getAircraftScaleForZoom('medium', 6)).toBeLessThan(300);
    expect(getAircraftScaleForZoom('medium', 11.5)).toBeGreaterThanOrEqual(22);
  });

  it('maps climb rate to pitch instead of an unrealistic roll', () => {
    expect(getAircraftOrientation({ heading: 92, verticalRate: 3 })).toEqual([3.75, -92, 0]);
    expect(getAircraftOrientation({ heading: 270, verticalRate: 100 })[0]).toBe(11);
  });
});
