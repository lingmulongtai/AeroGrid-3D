import { PerspectiveCamera, Quaternion, Vector2 } from 'three';
import { describe, expect, it } from 'vitest';
import { computeCelestialState } from './astro';
import { GlobeControls, maxTiltForRange } from './controls';
import { destinationPoint, EARTH_RADIUS_KM, greatCircleKm, lonLatToVector, MERCATOR_MAX_LATITUDE, vectorToLonLat } from './geo';

function makeControls() {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
  const camera = new PerspectiveCamera(38, 800 / 600, 0.001, 4_000_000);
  return { controls: new GlobeControls(camera, element), camera };
}

describe('geodesy', () => {
  it('round-trips geographic coordinates through world space', () => {
    for (const [lon, lat, alt] of [[0, 0, 0], [139.76, 35.68, 10], [-122.4, 37.7, 0.3], [179.9, -89.5, 400]]) {
      const back = vectorToLonLat(lonLatToVector(lon, lat, alt));
      expect(back.longitude).toBeCloseTo(lon, 6);
      expect(back.latitude).toBeCloseTo(lat, 6);
      expect(back.altitudeKm).toBeCloseTo(alt, 6);
    }
  });

  it('maps 0°E to +Z, 90°E to +X and the north pole to +Y', () => {
    expect(lonLatToVector(0, 0).z).toBeCloseTo(EARTH_RADIUS_KM);
    expect(lonLatToVector(90, 0).x).toBeCloseTo(EARTH_RADIUS_KM);
    expect(lonLatToVector(0, 90).y).toBeCloseTo(EARTH_RADIUS_KM);
  });

  it('advances along a great circle by the requested distance', () => {
    const [lon, lat] = destinationPoint(139.78, 35.55, 45, 500);
    expect(greatCircleKm(139.78, 35.55, lon, lat)).toBeCloseTo(500, 3);
  });

  it('uses the Web Mercator latitude limit for polar caps', () => {
    expect(MERCATOR_MAX_LATITUDE).toBeCloseTo(85.0511, 3);
  });
});

describe('Google Earth style camera rig', () => {
  it('looks straight down at the target with north up when untilted', () => {
    const { controls, camera } = makeControls();
    controls.rig.target.copy(lonLatToVector(10, 20, 0).normalize());
    controls.rig.range = 1000;
    controls.rig.tilt = 0;
    controls.rig.heading = 0;
    controls.applyRig();
    const snapshot = controls.snapshot();
    expect(snapshot.longitude).toBeCloseTo(10, 6);
    expect(snapshot.latitude).toBeCloseTo(20, 6);
    expect(snapshot.altitude).toBeCloseTo(1000, 3);
    const center = controls.pickSurface(new Vector2(0, 0))!;
    const { longitude, latitude } = vectorToLonLat(center);
    expect(longitude).toBeCloseTo(10, 4);
    expect(latitude).toBeCloseTo(20, 4);
    const above = controls.pickSurface(new Vector2(0, 0.5))!;
    expect(vectorToLonLat(above).latitude).toBeGreaterThan(20);
    expect(camera.position.length()).toBeGreaterThan(EARTH_RADIUS_KM);
  });

  it('keeps the point under the cursor fixed while zooming', () => {
    const { controls } = makeControls();
    controls.rig.target.copy(lonLatToVector(139.76, 35.68, 0).normalize());
    controls.rig.range = 4000;
    controls.rig.tilt = 30;
    controls.applyRig();
    const cursor = new Vector2(0.4, -0.3);
    const before = controls.pickSurface(cursor)!;
    controls.zoomBy(0.5, cursor);
    const after = controls.pickSurface(cursor)!;
    expect(controls.rig.range).toBeCloseTo(2000, 6);
    expect(before.distanceTo(after)).toBeLessThan(0.5);
  });

  it('orbits around the target without moving it and clamps tilt by range', () => {
    const { controls } = makeControls();
    controls.rig.range = 50;
    controls.applyRig();
    const target = controls.rig.target.clone();
    controls.orbit(30, 40);
    expect(controls.rig.heading).toBeCloseTo(30, 6);
    expect(controls.rig.tilt).toBeCloseTo(40, 6);
    expect(controls.rig.target.distanceTo(target)).toBeLessThan(1e-12);
    controls.orbit(0, 200);
    expect(controls.rig.tilt).toBeLessThanOrEqual(maxTiltForRange(50));
    expect(controls.snapshot().altitude).toBeGreaterThan(0);
  });

  it('crosses the poles continuously without losing the globe', () => {
    const { controls } = makeControls();
    controls.rig.target.copy(lonLatToVector(30, 80, 0).normalize());
    controls.rig.range = 8000;
    controls.applyRig();
    const before = controls.snapshot();
    const step = new Quaternion().setFromAxisAngle(lonLatToVector(120, 0, 0).normalize(), (-2 * Math.PI) / 180);
    for (let i = 0; i < 10; i++) {
      controls.rotateRig(step);
      expect(controls.pickSurface(new Vector2(0, 0))).not.toBeNull();
    }
    const after = controls.snapshot();
    expect(Number.isFinite(after.heading)).toBe(true);
    expect(after.latitude).toBeCloseTo(80, 4);
    expect(after.longitude).toBeCloseTo(-150, 4);
    expect(after.altitude).toBeCloseTo(before.altitude, 6);
  });
});

describe('astronomy', () => {
  it('places the June solstice sun over the Tropic of Cancer', () => {
    const state = computeCelestialState(new Date(Date.UTC(2026, 5, 21, 12, 0, 0)));
    const { latitude, longitude } = vectorToLonLat(state.sunDirection.clone().multiplyScalar(EARTH_RADIUS_KM));
    expect(latitude).toBeCloseTo(23.43, 0);
    expect(Math.abs(longitude)).toBeLessThan(3);
  });

  it('puts the Moon at a realistic geocentric distance', () => {
    const distance = computeCelestialState(new Date(Date.UTC(2026, 9, 12))).moonPosition.length();
    expect(distance).toBeGreaterThan(356_000);
    expect(distance).toBeLessThan(407_000);
  });
});
