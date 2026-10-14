// @vitest-environment node
import { BufferAttribute, InstancedMesh, Line, LineSegments, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { gstime, sgp4 } from 'satellite.js';
import { buildConstellation, constellationFromElements, satelliteFrame, sampleSatelliteWorldPosition, type SatelliteRecord } from '../../data/satellites';
import { siderealAngle } from '../astro';
import { SatelliteLayer, SATELLITE_KEYFRAME_MS } from './satellites';
import { FIXTURE_EPOCH, syntheticElements } from '../../../bench/fixtures';

vi.mock('satellite.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('satellite.js')>();
  return { ...actual, sgp4: vi.fn(actual.sgp4), gstime: vi.fn(actual.gstime) };
});
const exact = await vi.importActual<typeof import('satellite.js')>('satellite.js');
const epoch = FIXTURE_EPOCH;
const camera = new PerspectiveCamera();
camera.position.set(0, 0, 24_371);
const origin = new Vector3();
const gast = siderealAngle(new Date(epoch));
const angle = (time: number) => gast + (time - epoch) / 1000 * 7.2921159e-5;
const update = (layer: SatelliteLayer, time: number, offset = origin) => layer.update(time, angle(time), camera, offset, 1300);

// Independent reference: the previous propagate(Date) + WGS84 rendering path,
// deliberately not satelliteWorldPosition or any of the new clock helpers.
function reference(record: SatelliteRecord, time: number) {
  const satrec = exact.json2satrec(record.elements!);
  const state = exact.propagate(satrec, new Date(time))!;
  const gd = exact.eciToGeodetic(state.position, exact.gstime(new Date(time)));
  const radius = 6371 + gd.height;
  return new Vector3(radius * Math.cos(gd.latitude) * Math.sin(gd.longitude), radius * Math.sin(gd.latitude), radius * Math.cos(gd.latitude) * Math.cos(gd.longitude));
}

describe('satellite sampling precision and shared frame positions', () => {
  const records = constellationFromElements(syntheticElements(12).filter((_, i) => [0, 1, 3, 7, 11].includes(i)), 5, epoch);
  it.each(records.map((record) => [record.elements!.MEAN_MOTION, record] as const))('stays within 0.1 km for mean motion %s, including HEO perigee', (_, record) => {
    // Find actual SGP4 perigee, rather than assuming mean anomaly zero is perigee.
    let perigee = epoch, minimum = Infinity;
    for (let i = 0; i < 360; i++) {
      const time = epoch + i / 360 * record.periodMinutes * 60_000;
      const radius = reference(record, time).length();
      if (radius < minimum) { minimum = radius; perigee = time; }
    }
    const layer = new SatelliteLayer();
    layer.setConstellation([record]);
    let maxError = 0;
    for (let offset = -120_000; offset <= 120_000; offset += 200) {
      const time = perigee + offset;
      layer.prepareFrame(time, angle(time));
      maxError = Math.max(maxError, layer.getWorldPosition(record.id)!.distanceTo(reference(record, time)));
    }
    expect(maxError).toBeLessThanOrEqual(0.1);
    layer.dispose();
  });

  it('handles exact keyframe boundaries, multi-second jumps and a backward clock', () => {
    const layer = new SatelliteLayer(); layer.setConstellation(records);
    const times = new Set([0, 16, 500, 7000, 7016, 13_000]);
    for (let i = 0; i < records.length; i++) {
      const boundary = i / records.length * SATELLITE_KEYFRAME_MS;
      for (const offset of [-1, 0, 1]) if (boundary + offset >= 0) times.add(boundary + offset);
    }
    for (const dt of [...times].sort((a, b) => a - b)) {
      layer.prepareFrame(epoch + dt, angle(epoch + dt));
      for (const record of records) expect(layer.getWorldPosition(record.id)!.distanceTo(reference(record, epoch + dt))).toBeLessThanOrEqual(0.1);
    }
    const last = layer.getWorldPosition(records[0].id)!.clone();
    layer.prepareFrame(epoch + 5000, angle(epoch + 5000));
    expect(layer.getWorldPosition(records[0].id)).toEqual(last);
    layer.dispose();
  });

  it('preserves exact GMST/WGS84 samples even for long orbit offsets', () => {
    const frame = satelliteFrame(epoch, gast);
    for (const record of records) for (const offset of [-86_400_000, -150_000, 0, 1000, 86_400_000, 7 * 86_400_000]) {
      const position = sampleSatelliteWorldPosition(record, epoch + offset, frame, new Vector3());
      expect(position.distanceTo(reference(record, epoch + offset))).toBeLessThan(0.001);
    }
  });

  it('uses identical follow, picking, label, altitude, model and orbit-head positions', () => {
    const record = records[0]; const layer = new SatelliteLayer(); layer.setConstellation([record]);
    layer.selectedId = record.id;
    // Follow is evaluated before drawing, as it is in GlobeEngine.tick().
    const time = epoch + 384;
    const follow = layer.positionAt(record.id, time, angle(time))!;
    const offset = follow.clone().multiplyScalar(0.9);
    update(layer, time, offset);
    expect(layer.getWorldPosition(record.id)).toBe(follow);
    expect([...layer.pickPositions]).toEqual(follow.toArray());
    expect(layer.altitudeOf(record.id)).toBe(follow.length() - 6371);
    const mesh = layer.group.children.find((child) => child instanceof InstancedMesh && child.count > 0) as InstancedMesh;
    const matrix = new Matrix4(); mesh.getMatrixAt(0, matrix);
    expect(new Vector3().setFromMatrixPosition(matrix).add(offset).distanceTo(follow)).toBeLessThan(0.001);
    const orbit = layer.group.children.find((child) => child instanceof Line && !(child instanceof LineSegments)) as Line;
    const attribute = orbit.geometry.getAttribute('position') as BufferAttribute;
    const head = new Vector3().fromBufferAttribute(attribute, 0).add(orbit.position).add(offset);
    expect(head.distanceTo(follow)).toBeLessThan(0.001);
    const attributeBefore = attribute;
    update(layer, time + 16, offset.clone().addScalar(100));
    expect(orbit.geometry.getAttribute('position')).toBe(attributeBefore);
    // Replacing OMM under the same ID invalidates both position and orbit caches.
    const changed = { ...record, elements: { ...record.elements!, MEAN_ANOMALY: record.elements!.MEAN_ANOMALY + 20 } };
    layer.setConstellation([changed]); update(layer, time + 32);
    expect(layer.getWorldPosition(record.id)!.distanceTo(reference(changed, time + 32))).toBeLessThan(0.1);
    expect(orbit.geometry.getAttribute('position')).not.toBe(attributeBefore);
    layer.setConstellation([]); expect(layer.getWorldPosition(record.id)).toBeNull();
    layer.dispose();
  });

  it('keeps demo interpolation within 0.1 km of analytic positions', () => {
    const records = buildConstellation(300); const layer = new SatelliteLayer(); layer.setConstellation(records);
    for (const dt of [0, 16, 500, 1000, 5000, 5016]) {
      layer.prepareFrame(epoch + dt, angle(epoch + dt));
      for (const record of records) {
        const expected = sampleSatelliteWorldPosition(record, epoch + dt, satelliteFrame(epoch + dt, angle(epoch + dt)), new Vector3());
        expect(layer.getWorldPosition(record.id)!.distanceTo(expected)).toBeLessThan(0.1);
      }
    }
    layer.dispose();
  });
});

describe('satellite propagation budgets and cached geometry', () => {
  it('shows complete analytic demo trails immediately, including after a pause', () => {
    const record = buildConstellation(1)[0];
    const layer = new SatelliteLayer(); layer.setConstellation([record]);
    const trails = layer.group.children.find((child) => child instanceof LineSegments) as LineSegments;
    const attribute = trails.geometry.getAttribute('position') as BufferAttribute;
    for (const time of [epoch + 1234, epoch + 600_000]) {
      update(layer, time);
      const step = 150_000 / 13, newest = Math.floor(time / step);
      for (let k = 0; k < 13; k++) {
        const expected = sampleSatelliteWorldPosition(record, (newest - k) * step, satelliteFrame(time, angle(time)), new Vector3());
        expect(new Vector3().fromBufferAttribute(attribute, k * 2 + 1).distanceTo(expected)).toBeLessThan(0.001);
      }
    }
    layer.dispose();
  });

  it('bounds cold and warm 2400-satellite frames, including trails, selection and follow', () => {
    const records = constellationFromElements(syntheticElements(2400), 2400, epoch);
    expect(records).toHaveLength(2400);
    expect(records.filter((record) => record.periodMinutes >= 225)).toHaveLength(600);
    const layer = new SatelliteLayer(); layer.setConstellation(records); layer.selectedId = records[0].id;
    vi.mocked(sgp4).mockClear(); vi.mocked(gstime).mockClear();
    const counts: number[] = [];
    for (let i = 0; i < 60; i++) {
      const before = vi.mocked(sgp4).mock.calls.length;
      layer.positionAt(records[0].id, epoch + i * 16, angle(epoch + i * 16));
      update(layer, epoch + i * 16);
      counts.push(vi.mocked(sgp4).mock.calls.length - before);
    }
    // Cold: 2N anchors / 60 + N*0.016 refreshes + ceil(N/24) history
    // + 257 orbit samples / 60 = ~223 calls/frame, below N/10 (240).
    expect(counts.reduce((a, b) => a + b, 0) / 60).toBeLessThanOrEqual(240);
    // After the unavoidable initial anchors/selected orbit, no frame has a
    // constellation-wide refresh, even while the history ring is filling.
    expect(Math.max(...counts.slice(1))).toBeLessThanOrEqual(140);
    expect(vi.mocked(gstime).mock.calls.length).toBe(60);
    for (let i = 60; i < 800; i++) update(layer, epoch + i * 16);
    vi.mocked(sgp4).mockClear();
    for (let i = 800; i < 860; i++) update(layer, epoch + i * 16);
    expect(vi.mocked(sgp4).mock.calls.length / 60).toBeLessThanOrEqual(240);
    layer.dispose();
  }, 20_000);

  it('caches quantized past samples across boundaries, origin moves and trail toggles', () => {
    const record = constellationFromElements(syntheticElements(1), 1, epoch)[0];
    const layer = new SatelliteLayer(); layer.setConstellation([record]);
    for (let i = 0; i < 40; i++) update(layer, epoch + i * 16);
    const trails = layer.group.children.find((child) => child instanceof LineSegments) as LineSegments;
    const attribute = trails.geometry.getAttribute('position') as BufferAttribute;
    const past = new Vector3().fromBufferAttribute(attribute, 1);
    const time = epoch + 640, offset = new Vector3(6000, -4000, 3000);
    vi.mocked(sgp4).mockClear(); update(layer, time, offset);
    expect(vi.mocked(sgp4).mock.calls.length).toBe(0);
    expect(new Vector3().fromBufferAttribute(attribute, 1).add(offset).distanceTo(past)).toBeLessThan(0.001);
    expect(new Vector3().fromBufferAttribute(attribute, 0).add(offset).distanceTo(layer.getWorldPosition(record.id)!)).toBeLessThan(0.001);
    layer.showTrails = false; update(layer, epoch + 15_000, offset);
    layer.showTrails = true;
    for (let i = 0; i < 40; i++) update(layer, epoch + 15_000 + i * 16, offset);
    const newest = Math.floor((epoch + 15_624) / (150_000 / 13)) * (150_000 / 13);
    expect(new Vector3().fromBufferAttribute(attribute, 1).add(offset).distanceTo(reference(record, newest))).toBeLessThan(0.001);
    layer.dispose();
  });

  it('retains anchors and history on identical OMM polls and invalidates changed OMM', () => {
    const elements = syntheticElements(2);
    const records = constellationFromElements(elements, 2, epoch);
    const layer = new SatelliteLayer(); layer.setConstellation(records);
    for (let i = 0; i < 40; i++) update(layer, epoch + i * 16);
    const trails = layer.group.children.find((child) => child instanceof LineSegments) as LineSegments;
    const attribute = trails.geometry.getAttribute('position');
    const position = layer.getWorldPosition(records[0].id);
    const replacement = constellationFromElements(elements.map((element) => ({ ...element })), 2, epoch);
    vi.mocked(sgp4).mockClear();
    layer.setConstellation(replacement); update(layer, epoch + 640);
    expect(layer.list).toBe(replacement);
    expect(layer.getWorldPosition(records[0].id)).toBe(position);
    expect(trails.geometry.getAttribute('position')).toBe(attribute);
    expect(vi.mocked(sgp4).mock.calls.length).toBe(0);

    const changed = constellationFromElements(elements.map((element, i) => ({ ...element, MEAN_ANOMALY: element.MEAN_ANOMALY + (i === 0 ? 20 : 0) })), 2, epoch);
    vi.mocked(sgp4).mockClear();
    layer.setConstellation(changed); update(layer, epoch + 656);
    expect(trails.geometry.getAttribute('position')).not.toBe(attribute);
    expect(vi.mocked(sgp4).mock.calls.length).toBe(5); // Two anchors each + one budgeted history sample.
    expect(layer.getWorldPosition(changed[0].id)!.distanceTo(reference(changed[0], epoch + 656))).toBeLessThan(0.1);
    layer.dispose();
  });

  it('recalculates the 256-segment selected orbit only on selection or the 10-second deadline', () => {
    const records = constellationFromElements(syntheticElements(2), 2, epoch);
    const layer = new SatelliteLayer(); layer.setConstellation(records); layer.showTrails = true; layer.selectedId = records[0].id;
    update(layer, epoch);
    const orbit = layer.group.children.find((child) => child instanceof Line && !(child instanceof LineSegments)) as Line;
    const initial = orbit.geometry.getAttribute('position');
    update(layer, epoch + 9984); expect(orbit.geometry.getAttribute('position')).toBe(initial);
    update(layer, epoch + 10_000); expect(orbit.geometry.getAttribute('position')).not.toBe(initial);
    const next = orbit.geometry.getAttribute('position');
    layer.selectedId = records[1].id; update(layer, epoch + 10_016);
    expect(orbit.geometry.getAttribute('position')).not.toBe(next);
    const selected = orbit.geometry.getAttribute('position');
    layer.selectedId = null; update(layer, epoch + 10_032);
    layer.selectedId = records[1].id; update(layer, epoch + 10_048);
    expect(orbit.geometry.getAttribute('position')).not.toBe(selected);
    layer.dispose();
  });
});
