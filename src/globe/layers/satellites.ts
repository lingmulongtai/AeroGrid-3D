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
  satelliteWorldPosition,
  type SatelliteModelKind,
  type SatelliteRecord,
} from '../../data/satellites';
import { EARTH_RADIUS_KM } from '../geo';
import { createLiveryMaterial } from '../materials';
import { createSatelliteGeometries, MODEL_LENGTH_M } from '../models';

const EARTH_ROTATION_RAD_S = 7.2921159e-5;
const TRAIL_POINTS = 14;
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
const p1 = { x: 0, y: 0, z: 0 };
const p2 = { x: 0, y: 0, z: 0 };

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
  private trailFrame = 0;
  visible = true;
  showTrails = true;
  selectedId: string | null = null;
  pickPositions = new Float32Array(0);
  pickIds: string[] = [];
  private positionsById = new Map<string, Vector3>();

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
    this.pickPositions = new Float32Array(records.length * 3);
    this.selectedOrbitId = null;
  }

  getWorldPosition(id: string): Vector3 | null {
    return this.positionsById.get(id) ?? null;
  }

  positionAt(id: string, now: number, sidereal: number): Vector3 | null {
    const record = this.records.find((candidate) => candidate.id === id);
    if (!record) return null;
    satelliteWorldPosition(record, now, sidereal, p2);
    return new Vector3(p2.x, p2.y, p2.z);
  }

  private selectedOrbitId: string | null = null;

  private updateOrbit(record: SatelliteRecord | undefined, now: number, sidereal: number, origin: Vector3) {
    if (!record) {
      this.orbitLine.visible = false;
      return;
    }
    this.orbitLine.visible = true;
    if (this.selectedOrbitId !== record.id || this.trailFrame % 30 === 0) {
      this.selectedOrbitId = record.id;
      const samples = 256;
      const points = new Float32Array((samples + 1) * 3);
      const period = record.periodMinutes * 60;
      for (let i = 0; i <= samples; i++) {
        const dt = (i / samples) * period;
        satelliteWorldPosition(record, now + dt * 1000, sidereal + EARTH_ROTATION_RAD_S * dt, p1);
        points.set([p1.x - origin.x, p1.y - origin.y, p1.z - origin.z], i * 3);
      }
      this.orbitLine.geometry.setAttribute('position', new BufferAttribute(points, 3));
      this.orbitLine.geometry.computeBoundingSphere();
      this.orbitOrigin.copy(origin);
    }
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
    this.trailFrame++;
    const counters: Record<SatelliteModelKind, number> = { station: 0, satellite: 0, starlink: 0 };
    this.pickIds = new Array(this.records.length);
    const updateTrails = this.showTrails && this.trailFrame % 2 === 0;
    const trailPositions = this.trailGeometry.getAttribute('position') as BufferAttribute | undefined;
    const trailColors = this.trailGeometry.getAttribute('color') as BufferAttribute | undefined;
    let trailVertex = 0;

    this.records.forEach((record, index) => {
      satelliteWorldPosition(record, now, sidereal, p1);
      satelliteWorldPosition(record, now + 1000, sidereal + EARTH_ROTATION_RAD_S, p2);
      this.pickPositions[index * 3] = p1.x;
      this.pickPositions[index * 3 + 1] = p1.y;
      this.pickPositions[index * 3 + 2] = p1.z;
      this.pickIds[index] = record.id;
      const stored = this.positionsById.get(record.id) ?? new Vector3();
      this.positionsById.set(record.id, stored.set(p1.x, p1.y, p1.z));

      yAxis.set(p1.x, p1.y, p1.z).normalize();
      zAxis.set(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
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

      if (updateTrails && trailPositions && trailColors) {
        const seconds = trailSeconds(record);
        if (seconds === 0) return;
        const color = this.colors[index];
        const intensity = record.model === 'starlink' ? 0.28 : record.category === 'station' ? 1.6 : 0.85;
        let previous: [number, number, number] = [p1.x - origin.x, p1.y - origin.y, p1.z - origin.z];
        for (let k = 1; k < TRAIL_POINTS; k++) {
          const dt = (seconds * k) / (TRAIL_POINTS - 1);
          satelliteWorldPosition(record, now - dt * 1000, sidereal - EARTH_ROTATION_RAD_S * dt, p2);
          const current: [number, number, number] = [p2.x - origin.x, p2.y - origin.y, p2.z - origin.z];
          const fadeA = (1 - (k - 1) / (TRAIL_POINTS - 1)) ** 1.8 * intensity;
          const fadeB = (1 - k / (TRAIL_POINTS - 1)) ** 1.8 * intensity;
          trailPositions.setXYZ(trailVertex, previous[0], previous[1], previous[2]);
          trailColors.setXYZ(trailVertex++, color.r * fadeA, color.g * fadeA, color.b * fadeA);
          trailPositions.setXYZ(trailVertex, current[0], current[1], current[2]);
          trailColors.setXYZ(trailVertex++, color.r * fadeB, color.g * fadeB, color.b * fadeB);
          previous = current;
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
    if (updateTrails && trailPositions && trailColors) {
      this.trailGeometry.setDrawRange(0, trailVertex);
      trailPositions.needsUpdate = true;
      trailColors.needsUpdate = true;
      this.trailsOrigin.copy(origin);
    }
    this.trails.position.copy(this.trailsOrigin).sub(origin);

    const selected = this.selectedId ? this.records.find((record) => record.id === this.selectedId) : undefined;
    this.updateOrbit(selected, now, sidereal, origin);
  }

  private trailsOrigin = new Vector3();

  altitudeOf(id: string) {
    const position = this.positionsById.get(id);
    return position ? position.length() - EARTH_RADIUS_KM : null;
  }

  dispose() {
    for (const mesh of Object.values(this.meshes)) mesh.dispose();
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    this.trailGeometry.dispose();
    this.orbitLine.geometry.dispose();
  }
}
