import {
  CameraEventType,
  Cartesian2,
  Cartesian3,
  HeadingPitchRange,
  KeyboardEventModifier,
  Math as CesiumMath,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
  type Viewer,
} from 'cesium';

export type GlobeViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  height: number;
  heading: number;
  pitch: number;
};

export const INITIAL_CAMERA = {
  longitude: 139.76,
  latitude: 35.68,
  height: 15_500_000,
  heading: 0,
  pitch: -90,
} as const;

export const CAMERA_GESTURES = {
  rotate: [CameraEventType.LEFT_DRAG],
  tilt: [
    CameraEventType.MIDDLE_DRAG,
    CameraEventType.PINCH,
  ],
  orbit: [
    {eventType: CameraEventType.LEFT_DRAG, modifier: KeyboardEventModifier.SHIFT},
    {eventType: CameraEventType.LEFT_DRAG, modifier: KeyboardEventModifier.CTRL},
  ],
} as const;

export const ORBIT_LIMITS = {
  minimumPitch: CesiumMath.toRadians(-89.5),
  maximumPitch: CesiumMath.toRadians(-5),
} as const;

type OrbitState = {
  target: Cartesian3;
  heading: number;
  pitch: number;
  range: number;
};

type PointerMovement = {
  startPosition: Cartesian2;
  endPosition: Cartesian2;
};

const heightToZoom = (height: number) => Math.max(0, Math.min(20, Math.log2(40_000_000 / height)));

export function configureEarthCamera(viewer: Viewer) {
  const controller = viewer.scene.screenSpaceCameraController;
  controller.rotateEventTypes = [...CAMERA_GESTURES.rotate];
  controller.tiltEventTypes = [...CAMERA_GESTURES.tilt];
  // Cesium's stock Shift + drag is a first-person look. AeroGrid instead
  // installs an Earth-centered orbit around the point under the viewport.
  controller.lookEventTypes = [];
  controller.minimumZoomDistance = 25;
  controller.maximumZoomDistance = 90_000_000;
  controller.maximumTiltAngle = CesiumMath.toRadians(89.5);
  controller.enableCollisionDetection = true;
  controller.inertiaSpin = 0.82;
  controller.inertiaTranslate = 0.82;
  controller.inertiaZoom = 0.78;
}

export function orbitAnglesFromPointerDelta({
  heading,
  pitch,
  deltaX,
  deltaY,
  viewportSize,
}: {
  heading: number;
  pitch: number;
  deltaX: number;
  deltaY: number;
  viewportSize: number;
}) {
  const radiansPerPixel = Math.PI / Math.max(320, viewportSize);
  return {
    heading: CesiumMath.zeroToTwoPi(heading - deltaX * radiansPerPixel * 0.92),
    pitch: CesiumMath.clamp(
      pitch - deltaY * radiansPerPixel * 0.78,
      ORBIT_LIMITS.minimumPitch,
      ORBIT_LIMITS.maximumPitch,
    ),
  };
}

function pickOrbitTarget(viewer: Viewer) {
  const {camera, scene} = viewer;
  const center = new Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2);
  const ray = camera.getPickRay(center);
  return (ray ? scene.globe.pick(ray, scene) : undefined)
    ?? camera.pickEllipsoid(center, scene.globe.ellipsoid);
}

function readOrbitState(viewer: Viewer, target: Cartesian3): OrbitState {
  const transform = Transforms.eastNorthUpToFixedFrame(target, viewer.scene.globe.ellipsoid);
  const inverse = Matrix4.inverseTransformation(transform, new Matrix4());
  const localPosition = Matrix4.multiplyByPoint(inverse, viewer.camera.positionWC, new Cartesian3());
  const range = Math.max(25, Cartesian3.magnitude(localPosition));
  const horizontal = Math.hypot(localPosition.x, localPosition.y);
  const heading = horizontal < 0.001
    ? viewer.camera.heading
    : CesiumMath.zeroToTwoPi(Math.atan2(-localPosition.x, -localPosition.y));
  const pitch = CesiumMath.clamp(
    -Math.atan2(localPosition.z, horizontal),
    ORBIT_LIMITS.minimumPitch,
    ORBIT_LIMITS.maximumPitch,
  );
  return {target: Cartesian3.clone(target), heading, pitch, range};
}

/**
 * Installs a Google Earth-style orbit gesture. Shift/Ctrl + left drag keeps a
 * stable ground anchor, horizontal motion rotates around it, and vertical
 * motion tilts toward or away from the horizon.
 */
export function installEarthOrbitControls(viewer: Viewer) {
  const {canvas, screenSpaceCameraController: controller} = viewer.scene;
  const handler = new ScreenSpaceEventHandler(canvas);
  let orbit: OrbitState | null = null;
  let previousEnableInputs = true;

  const beginOrbit = () => {
    const target = pickOrbitTarget(viewer);
    if (!target) return;
    orbit = readOrbitState(viewer, target);
    previousEnableInputs = controller.enableInputs;
    controller.enableInputs = false;
    canvas.classList.add('is-orbiting');
  };

  const moveOrbit = (movement: PointerMovement) => {
    if (!orbit) return;
    const next = orbitAnglesFromPointerDelta({
      heading: orbit.heading,
      pitch: orbit.pitch,
      deltaX: movement.endPosition.x - movement.startPosition.x,
      deltaY: movement.endPosition.y - movement.startPosition.y,
      viewportSize: Math.min(canvas.clientWidth, canvas.clientHeight),
    });
    orbit.heading = next.heading;
    orbit.pitch = next.pitch;
    viewer.camera.lookAt(
      orbit.target,
      new HeadingPitchRange(orbit.heading, orbit.pitch, orbit.range),
    );
    viewer.scene.requestRender();
  };

  const endOrbit = () => {
    if (!orbit) return;
    orbit = null;
    controller.enableInputs = previousEnableInputs;
    // Leave the temporary ENU frame without changing the world-space view.
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    canvas.classList.remove('is-orbiting');
    // Custom lookAt updates do not consistently emit Cesium's moveEnd event.
    // Notify view-state subscribers so controls, LOD, and imagery selection
    // immediately reflect the completed Shift/Ctrl orbit.
    viewer.camera.moveEnd.raiseEvent();
    viewer.scene.requestRender();
  };

  for (const modifier of [KeyboardEventModifier.SHIFT, KeyboardEventModifier.CTRL]) {
    handler.setInputAction(beginOrbit, ScreenSpaceEventType.LEFT_DOWN, modifier);
    handler.setInputAction(moveOrbit, ScreenSpaceEventType.MOUSE_MOVE, modifier);
    handler.setInputAction(endOrbit, ScreenSpaceEventType.LEFT_UP, modifier);
  }
  handler.setInputAction(endOrbit, ScreenSpaceEventType.LEFT_UP);
  window.addEventListener('blur', endOrbit);

  return () => {
    endOrbit();
    window.removeEventListener('blur', endOrbit);
    handler.destroy();
  };
}

export function resetEarthCamera(viewer: Viewer, duration = 0.9) {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(
      INITIAL_CAMERA.longitude,
      INITIAL_CAMERA.latitude,
      INITIAL_CAMERA.height,
    ),
    orientation: {
      heading: CesiumMath.toRadians(INITIAL_CAMERA.heading),
      pitch: CesiumMath.toRadians(INITIAL_CAMERA.pitch),
      roll: 0,
    },
    duration,
  });
}

export function readEarthCamera(viewer: Viewer): GlobeViewState {
  const {camera, scene} = viewer;
  const center = new Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2);
  const centerPosition = camera.pickEllipsoid(center, scene.globe.ellipsoid);
  const centerCartographic = centerPosition
    ? scene.globe.ellipsoid.cartesianToCartographic(centerPosition)
    : camera.positionCartographic;
  const height = Math.max(0, camera.positionCartographic.height);

  return {
    longitude: CesiumMath.toDegrees(centerCartographic.longitude),
    latitude: CesiumMath.toDegrees(centerCartographic.latitude),
    zoom: heightToZoom(height),
    height,
    heading: CesiumMath.toDegrees(camera.heading),
    pitch: CesiumMath.toDegrees(camera.pitch),
  };
}
