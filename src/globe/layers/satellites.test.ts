import { Line, LineSegments, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildConstellation } from '../../data/satellites';
import { SatelliteLayer } from './satellites';

describe('satellite trail visibility', () => {
  it('toggles both recent trails and the selected orbit without hiding stations', () => {
    const layer = new SatelliteLayer();
    layer.setConstellation(buildConstellation(2));
    layer.selectedId = 'iss';
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 20_000);
    const update = () => layer.update(Date.UTC(2026, 9, 13), 0, camera, new Vector3(), 1000);
    update();
    const trails = layer.group.children.find((child) => child instanceof LineSegments)!;
    const orbit = layer.group.children.find((child) => child instanceof Line && !(child instanceof LineSegments))!;
    expect(trails.visible).toBe(true);
    expect(orbit.visible).toBe(true);
    layer.showTrails = false;
    update();
    expect(trails.visible).toBe(false);
    expect(orbit.visible).toBe(false);
    expect(layer.pickIds).toContain('iss');
    layer.showTrails = true;
    update();
    expect(orbit.visible).toBe(true);
    layer.dispose();
  });
});
