import { Matrix4, PerspectiveCamera, Quaternion, Ray, Vector2, Vector3 } from 'three';
import { DEG, EARTH_RADIUS_KM, lonLatToVector, vectorToLonLat } from './geo';

export interface CameraRig {
  /** Unit vector from the Earth's centre to the look-at point. */
  target: Vector3;
  targetAltitude: number;
  heading: number;
  tilt: number;
  range: number;
}

export interface CameraSnapshot {
  longitude: number;
  latitude: number;
  heading: number;
  tilt: number;
  range: number;
  altitude: number;
}

export interface FlyToOptions {
  longitude: number;
  latitude: number;
  altitude?: number;
  range: number;
  heading?: number;
  tilt?: number;
  duration?: number;
}

export interface FollowTarget {
  longitude: number;
  latitude: number;
  altitude: number;
  heading?: number;
}

const MIN_RANGE = 0.08;
const MAX_RANGE = 600_000;
const MIN_CAMERA_ALTITUDE = 0.04;
const tmp = new Vector3();
const tmp2 = new Vector3();

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function wrapDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function shortestAngle(from: number, to: number) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

export function maxTiltForRange(range: number) {
  return 88 - 58 * smoothstep(Math.log10(400), Math.log10(30_000), Math.log10(Math.max(range, 1)));
}

function frameAt(direction: Vector3) {
  const lon = Math.atan2(direction.x, direction.z);
  const east = new Vector3(Math.cos(lon), 0, -Math.sin(lon));
  const north = new Vector3().crossVectors(direction, east).normalize();
  return { east, north };
}

export class GlobeControls {
  readonly rig: CameraRig = {
    target: lonLatToVector(139.76, 35.68, 0).normalize(),
    targetAltitude: 0,
    heading: 0,
    tilt: 0,
    range: 18_000,
  };

  onChange: () => void = () => undefined;
  onUserNavigate: (kind: 'pan' | 'orbit' | 'zoom') => void = () => undefined;
  onClick: (x: number, y: number) => void = () => undefined;
  onHover: (x: number | null, y: number | null) => void = () => undefined;

  private pointers = new Map<number, Vector2>();
  private dragMode: 'grab' | 'orbit' | 'rotate' | 'pinch' | null = null;
  private grabAnchor: Vector3 | null = null;
  private downPosition = new Vector2();
  private moved = false;
  private lastMoveTime = 0;
  private angularVelocity = new Vector3();
  private pendingZoom = 0;
  private zoomNdc: Vector2 | null = null;
  private pinchDistance = 0;
  private pinchAngle = 0;
  private pinchCenter = new Vector2();
  private flight: {
    start: CameraRig;
    end: () => CameraRig;
    elapsed: number;
    duration: number;
  } | null = null;
  private follow: (() => FollowTarget | null) | null = null;
  private followHeadingOffset = 0;
  private followChase = false;
  private dirty = true;

  constructor(private camera: PerspectiveCamera, private element: HTMLElement) {
    element.addEventListener('pointerdown', this.handlePointerDown);
    element.addEventListener('pointermove', this.handlePointerMove);
    element.addEventListener('pointerup', this.handlePointerUp);
    element.addEventListener('pointercancel', this.handlePointerUp);
    element.addEventListener('pointerleave', this.handlePointerLeave);
    element.addEventListener('wheel', this.handleWheel, { passive: false });
    element.addEventListener('dblclick', this.handleDoubleClick);
    element.addEventListener('contextmenu', this.preventDefault);
    this.applyRig();
  }

  dispose() {
    const { element } = this;
    element.removeEventListener('pointerdown', this.handlePointerDown);
    element.removeEventListener('pointermove', this.handlePointerMove);
    element.removeEventListener('pointerup', this.handlePointerUp);
    element.removeEventListener('pointercancel', this.handlePointerUp);
    element.removeEventListener('pointerleave', this.handlePointerLeave);
    element.removeEventListener('wheel', this.handleWheel);
    element.removeEventListener('dblclick', this.handleDoubleClick);
    element.removeEventListener('contextmenu', this.preventDefault);
  }

  private preventDefault = (event: Event) => event.preventDefault();

  get isInteracting() {
    return this.dragMode !== null || Math.abs(this.pendingZoom) > 1e-4 || this.flight !== null || this.angularVelocity.lengthSq() > 1e-10;
  }

  snapshot(): CameraSnapshot {
    const { longitude, latitude } = vectorToLonLat(this.rig.target);
    return {
      longitude,
      latitude,
      heading: wrapDegrees(this.rig.heading),
      tilt: this.rig.tilt,
      range: this.rig.range,
      altitude: this.camera.position.length() - EARTH_RADIUS_KM,
    };
  }

  // ---------------------------------------------------------------- geometry

  applyRig() {
    const { target, targetAltitude, heading, tilt, range } = this.rig;
    const { east, north } = frameAt(target);
    const h = heading * DEG;
    const t = tilt * DEG;
    const forwardHorizontal = north.clone().multiplyScalar(Math.cos(h)).addScaledVector(east, Math.sin(h));
    const offset = target.clone().multiplyScalar(Math.cos(t)).addScaledVector(forwardHorizontal, -Math.sin(t));
    const lookAt = target.clone().multiplyScalar(EARTH_RADIUS_KM + targetAltitude);
    this.camera.position.copy(lookAt).addScaledVector(offset, range);
    const zAxis = offset.clone().normalize();
    const yAxis = forwardHorizontal.clone().multiplyScalar(Math.cos(t)).addScaledVector(target, Math.sin(t)).normalize();
    const xAxis = new Vector3().crossVectors(yAxis, zAxis).normalize();
    this.camera.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(xAxis, yAxis, zAxis));
    this.camera.updateMatrixWorld(true);
    this.dirty = true;
  }

  private forwardHorizontal(): Vector3 {
    const { east, north } = frameAt(this.rig.target);
    const h = this.rig.heading * DEG;
    return north.multiplyScalar(Math.cos(h)).addScaledVector(east, Math.sin(h));
  }

  /** Rigidly rotates the camera rig about the Earth's centre. */
  rotateRig(rotation: Quaternion) {
    const forward = this.forwardHorizontal().applyQuaternion(rotation);
    this.rig.target.applyQuaternion(rotation).normalize();
    const { east, north } = frameAt(this.rig.target);
    this.rig.heading = Math.atan2(forward.dot(east), forward.dot(north)) / DEG;
    this.applyRig();
  }

  private ndcFromClient(x: number, y: number, target = new Vector2()) {
    const rect = this.element.getBoundingClientRect();
    return target.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  }

  rayFromNdc(ndc: Vector2): Ray {
    const origin = this.camera.position.clone();
    const direction = tmp.set(ndc.x, ndc.y, 0.5).unproject(this.camera).sub(origin).normalize().clone();
    return new Ray(origin, direction);
  }

  /** Intersects the screen ray with the globe; falls back to the horizon point. */
  pickSurface(ndc: Vector2, radius = EARTH_RADIUS_KM, allowHorizon = false): Vector3 | null {
    const ray = this.rayFromNdc(ndc);
    const b = ray.origin.dot(ray.direction);
    const c = ray.origin.lengthSq() - radius * radius;
    const d = b * b - c;
    if (d >= 0) {
      const t = -b - Math.sqrt(d);
      if (t > 0) return ray.at(t, new Vector3());
    }
    if (!allowHorizon) return null;
    const closest = ray.at(Math.max(0, -b), new Vector3());
    return closest.setLength(radius);
  }

  // ------------------------------------------------------------- operations

  private clampRig() {
    const rig = this.rig;
    rig.range = Math.max(MIN_RANGE, Math.min(MAX_RANGE, rig.range));
    rig.tilt = Math.max(0, Math.min(maxTiltForRange(rig.range), rig.tilt));
    const base = EARTH_RADIUS_KM + rig.targetAltitude;
    const minimum = EARTH_RADIUS_KM + MIN_CAMERA_ALTITUDE;
    const cosLimit = (minimum * minimum - base * base - rig.range * rig.range) / (2 * base * rig.range);
    if (cosLimit > -1) {
      const limit = Math.acos(Math.max(-1, Math.min(1, cosLimit))) / DEG;
      rig.tilt = Math.min(rig.tilt, Math.max(0, limit - 0.5));
    }
  }

  zoomBy(factor: number, ndc: Vector2 | null = null) {
    const anchor = ndc ? this.pickSurface(ndc) : null;
    this.rig.range *= factor;
    this.clampRig();
    this.applyRig();
    if (anchor && ndc && !this.follow) {
      const current = this.pickSurface(ndc);
      if (current) this.rotateRig(new Quaternion().setFromUnitVectors(current.normalize(), anchor.clone().normalize()));
    }
    this.onChange();
  }

  orbit(deltaHeading: number, deltaTilt: number) {
    if (this.follow) this.followHeadingOffset += deltaHeading;
    this.rig.heading += deltaHeading;
    this.rig.tilt += deltaTilt;
    this.clampRig();
    this.applyRig();
    this.onChange();
  }

  resetNorth() {
    this.flyTo({ ...this.snapshotTarget(), range: this.rig.range, heading: 0, tilt: this.rig.tilt, duration: 0.8 });
  }

  private snapshotTarget() {
    const { longitude, latitude } = vectorToLonLat(this.rig.target);
    return { longitude, latitude, altitude: this.rig.targetAltitude };
  }

  flyTo(options: FlyToOptions) {
    const end = this.rigFromOptions(options);
    this.startFlight(() => end, options.duration);
  }

  private rigFromOptions(options: FlyToOptions): CameraRig {
    return {
      target: lonLatToVector(options.longitude, options.latitude, 0).normalize(),
      targetAltitude: options.altitude ?? 0,
      heading: options.heading ?? this.rig.heading,
      tilt: options.tilt ?? this.rig.tilt,
      range: options.range,
    };
  }

  private startFlight(end: () => CameraRig, duration?: number) {
    const start: CameraRig = { ...this.rig, target: this.rig.target.clone() };
    const destination = end();
    const arc = start.target.angleTo(destination.target);
    this.angularVelocity.set(0, 0, 0);
    this.pendingZoom = 0;
    this.flight = {
      start,
      end,
      elapsed: 0,
      duration: duration ?? Math.min(4.2, 1.1 + arc * 1.4 + Math.abs(Math.log(destination.range / start.range)) * 0.18),
    };
  }

  /** Locks the camera to a moving object. Pass null to release. */
  setFollow(getter: (() => FollowTarget | null) | null, options: { range: number; tilt: number; chase: boolean } | null = null) {
    this.follow = getter;
    if (!getter || !options) return;
    this.followChase = options.chase;
    const first = getter();
    if (!first) return;
    this.followHeadingOffset = 0;
    this.startFlight(() => {
      const live = getter() ?? first;
      return {
        target: lonLatToVector(live.longitude, live.latitude, 0).normalize(),
        targetAltitude: live.altitude,
        heading: options.chase && live.heading !== undefined ? live.heading : this.rig.heading,
        tilt: options.tilt,
        range: options.range,
      };
    });
  }

  get following() {
    return this.follow !== null;
  }

  // ----------------------------------------------------------------- events

  private handlePointerDown = (event: PointerEvent) => {
    this.element.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, new Vector2(event.clientX, event.clientY));
    this.flight = null;
    this.angularVelocity.set(0, 0, 0);
    this.moved = false;
    this.downPosition.set(event.clientX, event.clientY);

    if (this.pointers.size === 2) {
      this.dragMode = 'pinch';
      this.resetPinch();
      return;
    }

    const orbitGesture = event.button === 2 || event.button === 1 || event.ctrlKey || event.shiftKey || event.metaKey;
    if (event.altKey) {
      this.dragMode = 'rotate';
    } else if (orbitGesture) {
      this.dragMode = 'orbit';
    } else {
      this.dragMode = 'grab';
      const ndc = this.ndcFromClient(event.clientX, event.clientY);
      this.grabAnchor = this.pickSurface(ndc, EARTH_RADIUS_KM, true);
    }
    this.element.classList.add('is-dragging');
  };

  private resetPinch() {
    const [a, b] = [...this.pointers.values()];
    this.pinchDistance = a.distanceTo(b);
    this.pinchAngle = Math.atan2(b.y - a.y, b.x - a.x);
    this.pinchCenter.copy(a).add(b).multiplyScalar(0.5);
  }

  private handlePointerMove = (event: PointerEvent) => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) {
      this.onHover(event.clientX, event.clientY);
      return;
    }
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.set(event.clientX, event.clientY);
    if (this.downPosition.distanceTo(pointer) > 4) this.moved = true;
    if (!this.moved) return;

    if (this.dragMode === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const distance = a.distanceTo(b);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const center = a.clone().add(b).multiplyScalar(0.5);
      if (this.pinchDistance > 0 && distance > 0) {
        this.zoomBy(this.pinchDistance / distance, this.ndcFromClient(center.x, center.y));
      }
      const twist = shortestAngle(angle / DEG, this.pinchAngle / DEG);
      const tiltDelta = (this.pinchCenter.y - center.y) * 0.25;
      this.orbit(twist, tiltDelta);
      this.pinchDistance = distance;
      this.pinchAngle = angle;
      this.pinchCenter.copy(center);
      this.onUserNavigate('zoom');
      return;
    }

    if (this.dragMode === 'grab') {
      if (this.follow) {
        this.follow = null;
        this.onUserNavigate('pan');
      }
      const ndc = this.ndcFromClient(event.clientX, event.clientY);
      const current = this.pickSurface(ndc, EARTH_RADIUS_KM, true);
      if (current && this.grabAnchor) {
        const rotation = new Quaternion().setFromUnitVectors(current.normalize(), this.grabAnchor.clone().normalize());
        this.rotateRig(rotation);
        const now = performance.now();
        const dt = Math.max(1, now - this.lastMoveTime) / 1000;
        const axisAngle = this.quaternionToAxisAngle(rotation);
        this.angularVelocity.copy(axisAngle).divideScalar(Math.min(dt, 0.05));
        this.lastMoveTime = now;
        this.onChange();
      }
      this.onUserNavigate('pan');
    } else if (this.dragMode === 'orbit') {
      this.orbit(dx * 0.3, -dy * 0.3);
      this.onUserNavigate('orbit');
    } else if (this.dragMode === 'rotate') {
      this.orbit(dx * 0.35 + dy * 0.1, 0);
      this.onUserNavigate('orbit');
    }
  };

  private quaternionToAxisAngle(rotation: Quaternion) {
    const angle = 2 * Math.acos(Math.min(1, Math.abs(rotation.w)));
    const s = Math.sqrt(Math.max(0, 1 - rotation.w * rotation.w));
    if (s < 1e-8 || angle < 1e-9) return tmp2.set(0, 0, 0);
    const sign = rotation.w < 0 ? -1 : 1;
    return tmp2.set(rotation.x / s, rotation.y / s, rotation.z / s).multiplyScalar(angle * sign);
  }

  private handlePointerUp = (event: PointerEvent) => {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.delete(event.pointerId);
    if (this.element.hasPointerCapture(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
    if (this.pointers.size === 1 && this.dragMode === 'pinch') {
      this.dragMode = null;
      return;
    }
    if (this.pointers.size > 0) return;
    if (!this.moved && event.button === 0) this.onClick(event.clientX, event.clientY);
    if (this.dragMode !== 'grab' || performance.now() - this.lastMoveTime > 60) this.angularVelocity.set(0, 0, 0);
    this.dragMode = null;
    this.grabAnchor = null;
    this.element.classList.remove('is-dragging');
  };

  private handlePointerLeave = () => {
    if (!this.pointers.size) this.onHover(null, null);
  };

  private handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.flight = null;
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    const delta = Math.max(-240, Math.min(240, event.deltaY * scale));
    this.pendingZoom += delta * (event.ctrlKey ? 0.006 : 0.0018);
    this.zoomNdc = this.ndcFromClient(event.clientX, event.clientY);
    this.onUserNavigate('zoom');
  };

  private handleDoubleClick = (event: MouseEvent) => {
    const ndc = this.ndcFromClient(event.clientX, event.clientY);
    const point = this.pickSurface(ndc);
    if (!point) return;
    const { longitude, latitude } = vectorToLonLat(point);
    this.follow = null;
    this.flyTo({ longitude, latitude, range: Math.max(MIN_RANGE, this.rig.range * 0.35), duration: 0.9 });
  };

  // ------------------------------------------------------------------ frame

  /** Advances animations. Returns true when the camera moved this frame. */
  update(deltaSeconds: number): boolean {
    const dt = Math.min(0.1, deltaSeconds);

    if (this.flight) {
      const flight = this.flight;
      // Flights follow wall-clock time so they finish on schedule at any frame rate.
      flight.elapsed += Math.min(deltaSeconds, 0.5);
      const p = Math.min(1, flight.elapsed / flight.duration);
      const e = p * p * p * (p * (p * 6 - 15) + 10);
      const end = flight.end();
      const start = flight.start;
      const arc = start.target.angleTo(end.target);
      const target = new Vector3().copy(start.target);
      if (arc > 1e-6) {
        const rotation = new Quaternion().setFromUnitVectors(start.target, end.target);
        target.applyQuaternion(new Quaternion().slerp(rotation, e));
      }
      const peak = Math.max(start.range, end.range, arc * EARTH_RADIUS_KM * 0.85);
      const logRange = Math.log(start.range) + (Math.log(end.range) - Math.log(start.range)) * e
        + Math.log(peak / Math.max(start.range, end.range)) * Math.sin(Math.PI * e);
      this.rig.target.copy(target).normalize();
      this.rig.targetAltitude = start.targetAltitude + (end.targetAltitude - start.targetAltitude) * e;
      this.rig.heading = start.heading + shortestAngle(start.heading, end.heading) * e;
      this.rig.tilt = start.tilt + (end.tilt - start.tilt) * e;
      this.rig.range = Math.exp(logRange);
      this.clampRig();
      this.applyRig();
      if (p >= 1) this.flight = null;
      this.onChange();
    } else if (this.follow) {
      const live = this.follow();
      if (live) {
        this.rig.target.copy(lonLatToVector(live.longitude, live.latitude, 0)).normalize();
        this.rig.targetAltitude = live.altitude;
        if (this.followChase && live.heading !== undefined) {
          const desired = live.heading + this.followHeadingOffset;
          this.rig.heading += shortestAngle(this.rig.heading, desired) * Math.min(1, dt * 2.5);
        }
        this.clampRig();
        this.applyRig();
        this.onChange();
      }
    }

    if (Math.abs(this.pendingZoom) > 1e-4) {
      const step = this.pendingZoom * Math.min(1, dt * 14);
      this.pendingZoom -= step;
      this.zoomBy(Math.exp(step), this.zoomNdc);
    }

    if (this.dragMode === null && this.angularVelocity.lengthSq() > 1e-10) {
      const angle = this.angularVelocity.length() * dt;
      const axis = this.angularVelocity.clone().normalize();
      this.rotateRig(new Quaternion().setFromAxisAngle(axis, angle));
      this.angularVelocity.multiplyScalar(Math.exp(-dt * 4.5));
      if (this.angularVelocity.length() < 1e-4) this.angularVelocity.set(0, 0, 0);
      this.onChange();
    }

    const moved = this.dirty;
    this.dirty = false;
    return moved;
  }
}
