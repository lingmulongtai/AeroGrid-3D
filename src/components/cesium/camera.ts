import {
  CameraEventType,
  Cartesian2,
  Cartesian3,
  KeyboardEventModifier,
  Math as CesiumMath,
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
    {eventType: CameraEventType.LEFT_DRAG, modifier: KeyboardEventModifier.SHIFT},
    CameraEventType.PINCH,
  ],
} as const;

const heightToZoom = (height: number) => Math.max(0, Math.min(20, Math.log2(40_000_000 / height)));

export function configureEarthCamera(viewer: Viewer) {
  const controller = viewer.scene.screenSpaceCameraController;
  controller.rotateEventTypes = [...CAMERA_GESTURES.rotate];
  controller.tiltEventTypes = [...CAMERA_GESTURES.tilt];
  controller.minimumZoomDistance = 25;
  controller.maximumZoomDistance = 90_000_000;
  controller.maximumTiltAngle = CesiumMath.toRadians(89.5);
  controller.enableCollisionDetection = true;
  controller.inertiaSpin = 0.82;
  controller.inertiaTranslate = 0.82;
  controller.inertiaZoom = 0.78;
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
