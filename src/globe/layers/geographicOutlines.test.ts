import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { EARTH_RADIUS_KM } from '../geo';
import { geographicLineGeometry } from './geographicOutlines';

describe('geographic outline depth', () => {
  it('keeps long and date-line segments above imagery without bridging through Earth', () => {
    const geometry = geographicLineGeometry([[[179, 60], [-179, 60]], [[10, -60], [20, -65]]]);
    const positions = geometry.getAttribute('position');
    const start = new Vector3(), end = new Vector3();
    for (let i = 0; i < positions.count; i += 2) {
      start.fromBufferAttribute(positions, i); end.fromBufferAttribute(positions, i + 1);
      expect(start.clone().lerp(end, 0.5).length()).toBeGreaterThan(EARTH_RADIUS_KM + 0.006);
      expect(start.distanceTo(end)).toBeLessThan(18);
    }
    geometry.dispose();
  });
});
