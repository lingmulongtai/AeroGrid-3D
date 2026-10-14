import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  PerspectiveCamera,
  Vector3,
} from 'three';
import {
  SATELLITE_COLORS,
  satelliteFrame,
  sampleSatelliteWorldPosition,
  type SatelliteFrame,
  type SatelliteModelKind,
  type SatelliteRecord,
} from '../../data/satellites';
import { EARTH_RADIUS_KM } from '../geo';
import { createLiveryMaterial } from '../materials';
import { createSatelliteGeometries, MODEL_LENGTH_M } from '../models';

const TRAIL_POINTS = 14;
export const SATELLITE_KEYFRAME_MS = 1000;
const ORBIT_REFRESH_MS = 10_000;
const SELECTED_COLOR = new Color(1.2, 1.2, 1.15);
const TARGET_PIXELS: Record<SatelliteModelKind, number> = { station: 20, satellite: 11, starlink: 6.5 };
const MODEL_LENGTH: Record<SatelliteModelKind, number> = {
  station: MODEL_LENGTH_M.station,
  satellite: MODEL_LENGTH_M.satellite,
  starlink: MODEL_LENGTH_M.starlink,
};

const matrix = new Matrix4();
const scaleVector = new Vector3();
const xAxis = new Vector3();
const yAxis = new Vector3();
const zAxis = new Vector3();
const sample = new Vector3();

interface CachedSatellite {
  record: SatelliteRecord;
  position: Vector3;
  from: Vector3;
  to: Vector3;
  start: number;
  end: number;
  trail?: { step: number; points: Float64Array; ticks: Float64Array; offset: number };
}

function ringSlot(tick: number) {
  return ((tick % TRAIL_POINTS) + TRAIL_POINTS) % TRAIL_POINTS;
}

function trailSeconds(record: SatelliteRecord) {
  if (record.altitudeKm > 30_000) return 0;
  if (record.altitudeKm > 5_000) return 1_500;
  return 150;
}

export class SatelliteLayer {
  readonly group = new Group();
  private meshes: Record<SatelliteModelKind, InstancedMesh>;
  private geometries = createSatelliteGeometries();
  private records: SatelliteRecord[] = [];
  private colors: Color[] = [];
  private trailGeometry = new BufferGeometry();
  private trails: LineSegments;
  private orbitLine: Line;
  private emissive;
  private cached: CachedSatellite[] = [];
  private entriesById = new Map<string, CachedSatellite>();
  private frame: SatelliteFrame | null = null;
  private nextKeyframe = 0;
  private nextTrail = 0;
  private trailVertices = 0;
  visible = true;
  showTrails = true;
  selectedId: string | null = null;
  pickPositions = new Float64Array(0);
  pickIds: string[] = [];

  constructor() {
    const { material, emissive } = createLiveryMaterial({ metalness: 0.55, roughness: 0.35, emissive: 0.45 });
    this.emissive = emissive;
    this.meshes = Object.fromEntries((Object.keys(this.geometries) as SatelliteModelKind[]).map((model) => {
      const mesh = new InstancedMesh(this.geometries[model], material, 8);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
      return [model, mesh];
    })) as unknown as Record<SatelliteModelKind, InstancedMesh>;

    this.trails = new LineSegments(this.trailGeometry, new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }));
    this.trails.frustumCulled = false;
    this.trails.renderOrder = 5;
    this.group.add(this.trails);

    this.orbitLine = new Line(new BufferGeometry(), new LineBasicMaterial({
      color: new Color(0.5, 1.4, 1.1),
      transparent: true,
      opacity: 0.55,
      blending: AdditiveBlending,
      depthWrite: false,
    }));
    this.orbitLine.frustumCulled = false;
    this.orbitLine.visible = false;
    this.group.add(this.orbitLine);
  }

  get count() {
    return this.visible ? this.records.length : 0;
  }

  get list() {
    return this.records;
  }

  setNightVisibility(boost: number) {
    this.emissive.value = boost;
  }

  setConstellation(records: SatelliteRecord[]) {
    this.records = records;
    this.frame = null;
    this.nextKeyframe = this.nextTrail = this.trailVertices = 0;
    this.entriesById.clear();
    this.cached = records.map((record) => {
      const seconds = trailSeconds(record);
      const entry: CachedSatellite = {
        record, position: new Vector3(), from: new Vector3(), to: new Vector3(), start: 0, end: 0,
        trail: seconds ? { step: seconds * 1000 / (TRAIL_POINTS - 1), points: new Float64Array(TRAIL_POINTS * 3), ticks: new Float64Array(TRAIL_POINTS).fill(NaN), offset: this.trailVertices } : undefined,
      };
      if (seconds) this.trailVertices += (TRAIL_POINTS - 1) * 2;
      this.entriesById.set(record.id, entry);
      return entry;
    });
    this.colors = records.map((record) => new Color(SATELLITE_COLORS[record.category]).convertSRGBToLinear());
    const counts: Record<SatelliteModelKind, number> = { station: 0, satellite: 0, starlink: 0 };
    for (const record of records) counts[record.model]++;
    for (const model of Object.keys(counts) as SatelliteModelKind[]) {
      const previous = this.meshes[model];
      const mesh = new InstancedMesh(previous.geometry, previous.material, Math.max(1, counts[model]));
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.remove(previous);
      previous.dispose();
      this.group.add(mesh);
      this.meshes[model] = mesh;
    }
    const segments = records.length * (TRAIL_POINTS - 1) * 2;
    const positions = new BufferAttribute(new Float32Array(segments * 3), 3);
    const colors = new BufferAttribute(new Float32Array(segments * 3), 3);
    positions.setUsage(DynamicDrawUsage);
    colors.setUsage(DynamicDrawUsage);
    this.trailGeometry.setAttribute('position', positions);
    this.trailGeometry.setAttribute('color', colors);
    this.trailGeometry.setDrawRange(0, this.trailVertices);
    // Fades depend only on the record and segment, not on frame time.
    this.cached.forEach((entry, index) => {
      if (!entry.trail) return;
      const color = this.colors[index];
      const intensity = entry.record.model === 'starlink' ? 0.28 : entry.record.category === 'station' ? 1.6 : 0.85;
      for (let k = 0; k < TRAIL_POINTS - 1; k++) {
        const a = (1 - k / (TRAIL_POINTS - 1)) ** 1.8 * intensity;
        const b = (1 - (k + 1) / (TRAIL_POINTS - 1)) ** 1.8 * intensity;
        colors.setXYZ(entry.trail.offset + k * 2, color.r * a, color.g * a, color.b * a);
        colors.setXYZ(entry.trail.offset + k * 2 + 1, color.r * b, color.g * b, color.b * b);
      }
    });
    this.pickPositions = new Float64Array(records.length * 3);
    this.pickIds = records.map((record) => record.id);
    this.selectedOrbitId = null;
  }

  getWorldPosition(id: string): Vector3 | null {
    return this.frame ? this.entriesById.get(id)?.position ?? null : null;
  }

  positionAt(id: string, now: number, sidereal: number): Vector3 | null {
    this.prepareFrame(now, sidereal);
    return this.getWorldPosition(id);
  }

  /** Run before camera follow as well as drawing; all consumers share these positions. */
  prepareFrame(now: number, sidereal: number) {
    if (this.frame && now <= this.frame.timeMs) return;
    const previous = this.frame;
    this.frame = satelliteFrame(now, sidereal);
    const count = this.cached.length;
    if (!previous || now - previous.timeMs >= SATELLITE_KEYFRAME_MS) {
      // Initialisation/resume is exact immediately. Normal deadlines are evenly
      // phased over the next second, rather than updating every record together.
      this.cached.forEach((entry, index) => {
        entry.end = now + Math.floor(index / Math.max(1, count) * SATELLITE_KEYFRAME_MS);
        entry.start = entry.end - SATELLITE_KEYFRAME_MS;
        sampleSatelliteWorldPosition(entry.record, entry.start, this.frame!, entry.from);
        sampleSatelliteWorldPosition(entry.record, entry.end, this.frame!, entry.to);
      });
      this.nextKeyframe = 0;
    } else {
      for (let visited = 0; visited < count; visited++) {
        const entry = this.cached[this.nextKeyframe];
        if (now <= entry.end) break;
        entry.start = entry.end;
        entry.end += SATELLITE_KEYFRAME_MS;
        entry.from.copy(entry.to);
        sampleSatelliteWorldPosition(entry.record, entry.end, this.frame, entry.to);
        this.nextKeyframe = (this.nextKeyframe + 1) % count;
      }
    }
    this.cached.forEach((entry, index) => {
      entry.position.copy(entry.from).lerp(entry.to, (now - entry.start) / SATELLITE_KEYFRAME_MS);
      this.pickPositions[index * 3] = entry.position.x;
      this.pickPositions[index * 3 + 1] = entry.position.y;
      this.pickPositions[index * 3 + 2] = entry.position.z;
    });
  }

  private cacheTrails() {
    if (!this.frame || !this.cached.length) return;
    // At most N/24 exact history samples per frame, including cold fill. Prepare
    // the next absolute grid sample early so shared step boundaries cannot spike.
    let budget = Math.ceil(this.cached.length / 24);
    for (let visited = 0; visited < this.cached.length && budget; visited++) {
      const entry = this.cached[this.nextTrail];
      this.nextTrail = (this.nextTrail + 1) % this.cached.length;
      const trail = entry.trail;
      if (!trail) continue;
      const newest = Math.floor(this.frame.timeMs / trail.step);
      for (let k = 0; k < TRAIL_POINTS; k++) {
        const tick = k === TRAIL_POINTS - 1 ? newest + 1 : newest - k;
        const slot = ringSlot(tick);
        if (trail.ticks[slot] === tick) continue;
        sampleSatelliteWorldPosition(entry.record, tick * trail.step, this.frame, sample);
        trail.points[slot * 3] = sample.x;
        trail.points[slot * 3 + 1] = sample.y;
        trail.points[slot * 3 + 2] = sample.z;
        trail.ticks[slot] = tick;
        budget--;
        break;
      }
    }
  }

  private selectedOrbitId: string | null = null;
  private orbitSampleTime = -Infinity;

  private updateOrbit(record: SatelliteRecord | undefined, now: number, origin: Vector3) {
    if (!record || !this.showTrails) {
      this.orbitLine.visible = false;
      if (!record) this.selectedOrbitId = null;
      return;
    }
    this.orbitLine.visible = true;
    if (this.selectedOrbitId !== record.id || now - this.orbitSampleTime >= ORBIT_REFRESH_MS) {
      this.selectedOrbitId = record.id;
      this.orbitSampleTime = now;
      const samples = 256;
      const points = new Float32Array((samples + 1) * 3);
      const period = record.periodMinutes * 60;
      for (let i = 0; i <= samples; i++) {
        const dt = (i / samples) * period;
        sampleSatelliteWorldPosition(record, now + dt * 1000, this.frame!, sample);
        points[i * 3] = sample.x - origin.x;
        points[i * 3 + 1] = sample.y - origin.y;
        points[i * 3 + 2] = sample.z - origin.z;
      }
      this.orbitLine.geometry.setAttribute('position', new BufferAttribute(points, 3));
      this.orbitLine.geometry.computeBoundingSphere();
      this.orbitOrigin.copy(origin);
    }
    // Keep the orbit's head attached to the same interpolated position as the
    // model/camera, without propagating the other 256 vertices again.
    const position = this.entriesById.get(record.id)!.position;
    const points = this.orbitLine.geometry.getAttribute('position') as BufferAttribute;
    points.setXYZ(0, position.x - this.orbitOrigin.x, position.y - this.orbitOrigin.y, position.z - this.orbitOrigin.z);
    points.needsUpdate = true;
    this.orbitLine.position.copy(this.orbitOrigin).sub(origin);
  }

  private orbitOrigin = new Vector3();

  update(now: number, sidereal: number, camera: PerspectiveCamera, origin: Vector3, pixelsPerRadian: number) {
    this.group.visible = this.visible;
    if (!this.visible) {
      this.pickIds = [];
      return;
    }
    this.group.position.copy(origin);
    this.group.updateMatrixWorld(true);
    this.prepareFrame(now, sidereal);
    now = this.frame!.timeMs;
    const counters: Record<SatelliteModelKind, number> = { station: 0, satellite: 0, starlink: 0 };
    if (this.pickIds.length !== this.records.length) this.pickIds = this.records.map((record) => record.id);
    if (this.showTrails) this.cacheTrails();
    const trailPositions = this.trailGeometry.getAttribute('position') as BufferAttribute | undefined;
    this.cached.forEach((entry, index) => {
      const record = entry.record;
      const p1 = entry.position;

      yAxis.set(p1.x, p1.y, p1.z).normalize();
      zAxis.copy(entry.to).sub(entry.from);
      zAxis.addScaledVector(yAxis, -zAxis.dot(yAxis)).normalize();
      if (zAxis.lengthSq() < 0.5) zAxis.set(0, 1, 0).cross(yAxis).normalize();
      xAxis.crossVectors(yAxis, zAxis).normalize();

      const selected = record.id === this.selectedId;
      const distance = Math.hypot(p1.x - camera.position.x, p1.y - camera.position.y, p1.z - camera.position.z);
      const lengthKm = MODEL_LENGTH[record.model] / 1000;
      const pixels = TARGET_PIXELS[record.model] * (selected ? 1.7 : 1);
      const scale = Math.max(1, (pixels * distance) / (lengthKm * pixelsPerRadian)) / 1000;
      matrix.makeBasis(xAxis, yAxis, zAxis).scale(scaleVector.set(scale, scale, scale));
      matrix.setPosition(p1.x - origin.x, p1.y - origin.y, p1.z - origin.z);
      const mesh = this.meshes[record.model];
      const slot = counters[record.model]++;
      mesh.setMatrixAt(slot, matrix);
      mesh.setColorAt(slot, selected ? SELECTED_COLOR : this.colors[index]);

      if (this.showTrails && trailPositions && entry.trail) {
        const trail = entry.trail;
        const newest = Math.floor(now / trail.step);
        let x = p1.x, y = p1.y, z = p1.z;
        for (let k = 0; k < TRAIL_POINTS - 1; k++) {
          const vertex = trail.offset + k * 2;
          trailPositions.setXYZ(vertex, x - origin.x, y - origin.y, z - origin.z);
          const tick = newest - k;
          const slot = ringSlot(tick);
          if (trail.ticks[slot] === tick) {
            x = trail.points[slot * 3]; y = trail.points[slot * 3 + 1]; z = trail.points[slot * 3 + 2];
          }
          trailPositions.setXYZ(vertex + 1, x - origin.x, y - origin.y, z - origin.z);
        }
      }
    });

    for (const model of Object.keys(counters) as SatelliteModelKind[]) {
      const mesh = this.meshes[model];
      mesh.count = counters[model];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    this.trails.visible = this.showTrails;
    if (this.showTrails && trailPositions) {
      trailPositions.needsUpdate = true;
      this.trailsOrigin.copy(origin);
    }
    this.trails.position.copy(this.trailsOrigin).sub(origin);

    const selected = this.selectedId ? this.records.find((record) => record.id === this.selectedId) : undefined;
    this.updateOrbit(selected, now, origin);
  }

  private trailsOrigin = new Vector3();

  altitudeOf(id: string) {
    const position = this.getWorldPosition(id);
    return position ? position.length() - EARTH_RADIUS_KM : null;
  }

  dispose() {
    for (const mesh of Object.values(this.meshes)) mesh.dispose();
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    this.trailGeometry.dispose();
    this.orbitLine.geometry.dispose();
  }
}
