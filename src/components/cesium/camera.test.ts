import {describe, expect, it} from 'vitest';
import {CameraEventType, KeyboardEventModifier} from 'cesium';
import {CAMERA_GESTURES, INITIAL_CAMERA} from './camera';

describe('Cesium earth camera contract', () => {
  it('keeps the full WGS84 globe available without a polar latitude clamp', () => {
    expect(INITIAL_CAMERA.latitude).toBeGreaterThan(-90);
    expect(INITIAL_CAMERA.latitude).toBeLessThan(90);
  });

  it('maps Shift + left drag to the primary tilt gesture', () => {
    expect(CAMERA_GESTURES.tilt).toContainEqual({
      eventType: CameraEventType.LEFT_DRAG,
      modifier: KeyboardEventModifier.SHIFT,
    });
  });
});
