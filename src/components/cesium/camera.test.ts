import {describe, expect, it} from 'vitest';
import {CameraEventType, KeyboardEventModifier} from 'cesium';
import {
  CAMERA_GESTURES,
  INITIAL_CAMERA,
  ORBIT_LIMITS,
  orbitAnglesFromPointerDelta,
} from './camera';

describe('Cesium earth camera contract', () => {
  it('keeps the full WGS84 globe available without a polar latitude clamp', () => {
    expect(INITIAL_CAMERA.latitude).toBeGreaterThan(-90);
    expect(INITIAL_CAMERA.latitude).toBeLessThan(90);
  });

  it('maps Shift and Ctrl + left drag to anchored orbit gestures', () => {
    expect(CAMERA_GESTURES.orbit).toContainEqual({
      eventType: CameraEventType.LEFT_DRAG,
      modifier: KeyboardEventModifier.SHIFT,
    });
    expect(CAMERA_GESTURES.orbit).toContainEqual({
      eventType: CameraEventType.LEFT_DRAG,
      modifier: KeyboardEventModifier.CTRL,
    });
  });

  it('uses vertical movement for tilt and horizontal movement for heading', () => {
    const next = orbitAnglesFromPointerDelta({
      heading: 0,
      pitch: -Math.PI / 2,
      deltaX: 120,
      deltaY: -180,
      viewportSize: 900,
    });

    expect(next.heading).not.toBe(0);
    expect(next.pitch).toBeGreaterThan(-Math.PI / 2);
    expect(next.pitch).toBeLessThanOrEqual(ORBIT_LIMITS.maximumPitch);
  });

  it('clamps orbit tilt before crossing the ground plane', () => {
    const next = orbitAnglesFromPointerDelta({
      heading: 0,
      pitch: -Math.PI / 4,
      deltaX: 0,
      deltaY: -100_000,
      viewportSize: 900,
    });

    expect(next.pitch).toBe(ORBIT_LIMITS.maximumPitch);
  });
});
