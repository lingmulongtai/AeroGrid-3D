import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  PerspectiveCamera,
  Vector3,
} from 'three';
import type { FlightCategory, FlightRecord } from '../../../shared/contracts';
import { getFlightColor } from '../../utils/flightUtils';
import { destinationPoint, EARTH_RADIUS_KM, enuFrame, lonLatToVector } from '../geo';
import { createLiveryMaterial } from '../materials';
import { createAircraftGeometries, MODEL_LENGTH_M, type AircraftModel } from '../models';

export type ColorMode = 'altitude' | 'speed' | 'category';

interface Track {
  flight: FlightRecord;
  t0: number;
  model: AircraftModel;
  scale: number;
  color: Color;
  correction: { lon: number; lat: number; alt: number; heading: number; start: number } | null;
  display: { longitude: number; latitude: number; altitudeKm: number; heading: number };
}

const MODEL_FOR_CATEGORY: Record<FlightCategory, { model: AircraftModel; scale: number }> = {
  heavy: { model: 'heavy', scale: 1 },
  large: { model: 'twin', scale: 1.25 },
  medium: { model: 'twin', scale: 0.86 },
  small: { model: 'twin', scale: 0.62 },
  high_performance: { model: 'twin', scale: 0.45 },
  light: { model: 'light', scale: 1 },
  rotorcraft: { model: 'rotor', scale: 1 },
};

const BLEND_SECONDS = 1.6;
const SELECTED_COLOR = new Color(1.12, 1.1, 1.0);
const MAX_EXTRAPOLATION_S = 150;

const matrix = new Matrix4();
const position = new Vector3();
const xAxis = new Vector3();
const yAxis = new Vector3();
const zAxis = new Vector3();

function shortestAngle(from: number, to: number) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function srgbColor(rgba: [number, number, number, number]) {
  return new Color(rgba[0] / 255, rgba[1] / 255, rgba[2] / 255).convertSRGBToLinear();
}

export class AircraftLayer {
  readonly group = new Group();
  private tracks = new Map<string, Track>();
  private order: Track[] = [];
  private meshes: Record<AircraftModel, InstancedMesh>;
  private geometries = createAircraftGeometries();
  private emissive;
  private trails: LineSegments;
  private trailGeometry = new BufferGeometry();
  private colorMode: ColorMode = 'altitude';
  selectedId: string | null = null;
  showTrails = false;
  visible = true;
  /** World positions from the most recent frame, used for screen-space picking. */
  pickPositions = new Float32Array(0);
  pickIds: string[] = [];

  constructor() {
    const { material, emissive } = createLiveryMaterial({ metalness: 0.35, roughness: 0.42, emissive: 0.32 });
    this.emissive = emissive;
    this.meshes = Object.fromEntries((Object.keys(this.geometries) as AircraftModel[]).map((model) => {
      const mesh = new InstancedMesh(this.geometries[model], material, 16);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.name = `aircraft:${model}`;
      this.group.add(mesh);
      return [model, mesh];
    })) as unknown as Record<AircraftModel, InstancedMesh>;

    this.trails = new LineSegments(this.trailGeometry, new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }));
    this.trails.frustumCulled = false;
    this.trails.renderOrder = 4;
    this.group.add(this.trails);
  }

  setNightVisibility(boost: number) {
    this.emissive.value = boost;
  }

  setFlights(flights: FlightRecord[], snapshotMs: number, colorMode: ColorMode) {
    const now = Date.now();
    const next = new Map<string, Track>();
    this.colorMode = colorMode;
    for (const flight of flights) {
      const previous = this.tracks.get(flight.id);
      const { model, scale } = MODEL_FOR_CATEGORY[flight.category] ?? MODEL_FOR_CATEGORY.medium;
      const t0 = snapshotMs - flight.lastSeenSeconds * 1000;
      const track: Track = {
        flight,
        t0,
        model,
        scale,
        color: srgbColor(getFlightColor(colorMode, flight.altitude, flight.velocity, flight.category)),
        correction: null,
        display: { longitude: flight.longitude, latitude: flight.latitude, altitudeKm: flight.altitude / 1000, heading: flight.heading },
      };
      if (previous) {
        const fresh = this.extrapolate(track, now);
        const old = previous.display;
        const dLon = shortestAngle(fresh.longitude, old.longitude);
        const dLat = old.latitude - fresh.latitude;
        if (Math.abs(dLon) < 2 && Math.abs(dLat) < 2) {
          track.correction = {
            lon: dLon,
            lat: dLat,
            alt: old.altitudeKm - fresh.altitudeKm,
            heading: shortestAngle(fresh.heading, old.heading),
            start: now,
          };
        }
        track.display = { ...old };
      }
      next.set(flight.id, track);
    }
    this.tracks = next;
    this.order = [...next.values()];
    this.ensureCapacity();
  }

  recolor(colorMode: ColorMode) {
    if (colorMode === this.colorMode) return;
    this.colorMode = colorMode;
    for (const track of this.order) {
      const f = track.flight;
      track.color = srgbColor(getFlightColor(colorMode, f.altitude, f.velocity, f.category));
    }
  }

  private ensureCapacity() {
    const counts: Record<AircraftModel, number> = { twin: 0, heavy: 0, light: 0, rotor: 0 };
    for (const track of this.order) counts[track.model]++;
    for (const model of Object.keys(counts) as AircraftModel[]) {
      const mesh = this.meshes[model];
      if (mesh.instanceMatrix.count >= counts[model]) continue;
      const capacity = Math.ceil(counts[model] * 1.3) + 8;
      const replacement = new InstancedMesh(mesh.geometry, mesh.material, capacity);
      replacement.instanceMatrix.setUsage(DynamicDrawUsage);
      replacement.frustumCulled = false;
      replacement.name = mesh.name;
      replacement.count = 0;
      this.group.remove(mesh);
      mesh.dispose();
      this.group.add(replacement);
      this.meshes[model] = replacement;
    }
  }

  private extrapolate(track: Track, now: number) {
    const f = track.flight;
    const seconds = Math.max(0, Math.min(MAX_EXTRAPOLATION_S, (now - track.t0) / 1000));
    if (f.onGround || f.velocity < 1) {
      return { longitude: f.longitude, latitude: f.latitude, altitudeKm: f.altitude / 1000, heading: f.heading };
    }
    const [longitude, latitude] = destinationPoint(f.longitude, f.latitude, f.heading, (f.velocity * seconds) / 1000);
    const altitudeKm = Math.max(0, (f.altitude + f.verticalRate * Math.min(seconds, 60)) / 1000);
    return { longitude, latitude, altitudeKm, heading: f.heading };
  }

  private displayAt(track: Track, now: number) {
    const display = this.extrapolate(track, now);
    if (track.correction) {
      const p = Math.min(1, (now - track.correction.start) / (BLEND_SECONDS * 1000));
      const k = 1 - p * p * (3 - 2 * p);
      display.longitude += track.correction.lon * k;
      display.latitude += track.correction.lat * k;
      display.altitudeKm += track.correction.alt * k;
      display.heading += track.correction.heading * k;
    }
    return display;
  }

  getDisplay(id: string) {
    const track = this.tracks.get(id);
    return track ? track.display : null;
  }

  /** Position at an arbitrary instant, so a follow camera matches this frame exactly. */
  positionAt(id: string, now: number) {
    const track = this.tracks.get(id);
    return track ? this.displayAt(track, now) : null;
  }

  get count() {
    return this.order.length;
  }

  update(now: number, camera: PerspectiveCamera, origin: Vector3, pixelsPerRadian: number) {
    this.group.visible = this.visible;
    if (!this.visible) {
      this.pickIds = [];
      return;
    }
    this.group.position.copy(origin);
    this.group.updateMatrixWorld(true);
    const cameraAltitude = camera.position.length() - EARTH_RADIUS_KM;
    const targetPixels = 7 + 15 * (1 - Math.min(1, Math.max(0, (Math.log10(Math.max(cameraAltitude, 1)) - 2.3) / 2)));
    const counters: Record<AircraftModel, number> = { twin: 0, heavy: 0, light: 0, rotor: 0 };
    if (this.pickPositions.length < this.order.length * 3) this.pickPositions = new Float32Array(this.order.length * 3 + 96);
    this.pickIds = [];

    for (const track of this.order) {
      const display = this.displayAt(track, now);
      if (track.correction && now - track.correction.start > BLEND_SECONDS * 1000) track.correction = null;
      track.display = display;

      lonLatToVector(display.longitude, display.latitude, display.altitudeKm, position);
      const index = this.pickIds.length;
      this.pickPositions[index * 3] = position.x;
      this.pickPositions[index * 3 + 1] = position.y;
      this.pickPositions[index * 3 + 2] = position.z;
      this.pickIds.push(track.flight.id);

      const { east, north, up } = enuFrame(display.longitude, display.latitude);
      const heading = (display.heading * Math.PI) / 180;
      zAxis.copy(north).multiplyScalar(Math.cos(heading)).addScaledVector(east, Math.sin(heading));
      const climb = Math.max(-0.12, Math.min(0.12, track.flight.verticalRate / Math.max(60, track.flight.velocity)));
      zAxis.addScaledVector(up, climb).normalize();
      xAxis.crossVectors(up, zAxis).normalize();
      yAxis.crossVectors(zAxis, xAxis).normalize();

      const lengthKm = (MODEL_LENGTH_M[track.model] * track.scale) / 1000;
      const distance = position.distanceTo(camera.position);
      const selected = track.flight.id === this.selectedId;
      const pixels = targetPixels * (selected ? 1.5 : 1);
      const screenScale = (pixels * distance) / (lengthKm * pixelsPerRadian);
      const scale = (track.scale / 1000) * Math.max(1, screenScale);

      matrix.makeBasis(xAxis, yAxis, zAxis).scale(position.set(scale, scale, scale));
      lonLatToVector(display.longitude, display.latitude, display.altitudeKm, position).sub(origin);
      matrix.setPosition(position);
      const mesh = this.meshes[track.model];
      const slot = counters[track.model]++;
      mesh.setMatrixAt(slot, matrix);
      mesh.setColorAt(slot, selected ? SELECTED_COLOR : track.color);
    }

    for (const model of Object.keys(counters) as AircraftModel[]) {
      const mesh = this.meshes[model];
      mesh.count = counters[model];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.updateTrails(now, origin);
  }

  private lastTrailUpdate = 0;
  private trailOrigin = new Vector3();

  private updateTrails(now: number, origin: Vector3) {
    this.trails.visible = this.showTrails;
    if (!this.showTrails) return;
    // Trails are rebuilt at 5 Hz; between rebuilds the mesh is shifted to
    // compensate for the floating origin moving with the camera.
    this.trails.position.copy(this.trailOrigin).sub(origin);
    if (now - this.lastTrailUpdate < 200) return;
    this.lastTrailUpdate = now;
    this.trailOrigin.copy(origin);
    this.trails.position.set(0, 0, 0);
    const vertices: number[] = [];
    const colors: number[] = [];
    const a = new Vector3();
    const b = new Vector3();
    for (const track of this.order) {
      const history = track.flight.positionHistory;
      if (history.length < 1) continue;
      const points: Array<[number, number, number]> = [...history, [track.display.longitude, track.display.latitude, track.display.altitudeKm * 1000]];
      const c = track.color;
      for (let i = 0; i < points.length - 1; i++) {
        const fadeA = (i / (points.length - 1)) ** 1.6;
        const fadeB = ((i + 1) / (points.length - 1)) ** 1.6;
        lonLatToVector(points[i][0], points[i][1], points[i][2] / 1000, a).sub(origin);
        lonLatToVector(points[i + 1][0], points[i + 1][1], points[i + 1][2] / 1000, b).sub(origin);
        vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
        colors.push(c.r * fadeA, c.g * fadeA, c.b * fadeA, c.r * fadeB, c.g * fadeB, c.b * fadeB);
      }
    }
    this.trailGeometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    this.trailGeometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
    this.trailGeometry.computeBoundingSphere();
  }

  dispose() {
    for (const mesh of Object.values(this.meshes)) mesh.dispose();
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    this.trailGeometry.dispose();
  }
}
