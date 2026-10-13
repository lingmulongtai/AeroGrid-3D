import { BufferAttribute, BufferGeometry, Group, Points, PointsMaterial, Vector3 } from 'three';
import type { PublicCamera, ShipRecord } from '../../../shared/live';
import { lonLatToVector } from '../geo';

export class PublicContacts {
  readonly group = new Group();
  private ships = new Points(new BufferGeometry(), new PointsMaterial({ color: '#55d7ef', size: 7, sizeAttenuation: false }));
  private cameras = new Points(new BufferGeometry(), new PointsMaterial({ color: '#dc97ff', size: 6, sizeAttenuation: false }));
  shipRecords: ShipRecord[] = [];
  cameraRecords: PublicCamera[] = [];
  constructor() { this.group.add(this.ships, this.cameras); this.ships.frustumCulled = this.cameras.frustumCulled = false; }
  setShips(records: ShipRecord[]) { this.shipRecords = records; this.setPositions(this.ships, records); }
  setCameras(records: PublicCamera[]) { this.cameraRecords = records; this.setPositions(this.cameras, records); }
  setVisible(ships: boolean, cameras: boolean) { this.ships.visible = ships; this.cameras.visible = cameras; }
  getPosition(kind: 'ship' | 'camera', id: string): Vector3 | null {
    const record = (kind === 'ship' ? this.shipRecords : this.cameraRecords).find((item) => item.id === id);
    return record ? lonLatToVector(record.longitude, record.latitude, 0.04) : null;
  }
  getCandidates() {
    return [...(this.ships.visible ? this.shipRecords.map((r) => ({ kind: 'ship' as const, id: r.id, position: lonLatToVector(r.longitude, r.latitude, 0.04) })) : []), ...(this.cameras.visible ? this.cameraRecords.map((r) => ({ kind: 'camera' as const, id: r.id, position: lonLatToVector(r.longitude, r.latitude, 0.04) })) : [])];
  }
  private setPositions(points: Points, records: Array<{ latitude: number; longitude: number }>) {
    const positions = new Float32Array(records.length * 3);
    records.forEach((record, i) => lonLatToVector(record.longitude, record.latitude, 0.04).toArray(positions, i * 3));
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(positions, 3));
    points.geometry.dispose(); points.geometry = geometry;
  }
  dispose() { for (const points of [this.ships, this.cameras]) { points.geometry.dispose(); points.material.dispose(); } }
}
