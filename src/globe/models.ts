import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

// Faceted, low-poly models built in metres: +Z is the nose / velocity
// direction, +Y is up, wings extend along ±X. Each vertex carries a base
// paint colour and a livery mask that blends towards the per-instance colour.

type Vec3 = [number, number, number];
type Paint = { color: Vec3; mask?: number };

class MeshBuilder {
  private positions: number[] = [];
  private colors: number[] = [];
  private masks: number[] = [];

  triangle(a: Vec3, b: Vec3, c: Vec3, paint: Paint) {
    this.positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) {
      this.colors.push(...paint.color);
      this.masks.push(paint.mask ?? 0);
    }
  }

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, paint: Paint) {
    this.triangle(a, b, c, paint);
    this.triangle(a, c, d, paint);
  }

  /** Connects rings of equal vertex count; rings ordered from tail to nose. */
  loft(rings: Vec3[][], paint: Paint | ((ring: number, side: number) => Paint), capEnds = true) {
    const paintAt = typeof paint === 'function' ? paint : () => paint;
    for (let r = 0; r < rings.length - 1; r++) {
      const a = rings[r];
      const b = rings[r + 1];
      for (let i = 0; i < a.length; i++) {
        const j = (i + 1) % a.length;
        this.quad(a[i], a[j], b[j], b[i], paintAt(r, i));
      }
    }
    if (!capEnds) return;
    const first = rings[0];
    const last = rings[rings.length - 1];
    const centroid = (ring: Vec3[]) => ring.reduce<Vec3>((sum, p) => [sum[0] + p[0] / ring.length, sum[1] + p[1] / ring.length, sum[2] + p[2] / ring.length], [0, 0, 0]);
    const c0 = centroid(first);
    const c1 = centroid(last);
    for (let i = 0; i < first.length; i++) {
      const j = (i + 1) % first.length;
      this.triangle(c0, first[j], first[i], paintAt(0, i));
      this.triangle(c1, last[i], last[j], paintAt(rings.length - 2, i));
    }
  }

  box(center: Vec3, size: Vec3, paint: Paint) {
    const [cx, cy, cz] = center;
    const [sx, sy, sz] = size.map((v) => v / 2) as Vec3;
    const ring = (z: number): Vec3[] => [
      [cx - sx, cy - sy, z], [cx + sx, cy - sy, z], [cx + sx, cy + sy, z], [cx - sx, cy + sy, z],
    ];
    this.loft([ring(cz - sz), ring(cz + sz)], paint);
  }

  /** A swept, tapered aerofoil slab between a root and a tip section. */
  surface(root: { x: number; y: number; lead: number; trail: number; thick: number },
    tip: { x: number; y: number; lead: number; trail: number; thick: number },
    paint: Paint, vertical = false) {
    const section = (s: typeof root): Vec3[] => {
      const chord = s.lead - s.trail;
      const mid = s.trail + chord * 0.62;
      const h = s.thick / 2;
      const pts: Array<[number, number]> = [
        [s.lead, 0], [mid, h], [s.trail, h * 0.25], [s.trail, -h * 0.25], [mid, -h],
      ];
      return pts.map(([z, t]) => (vertical ? [t, s.y, z] : [s.x, s.y + t, z]) as Vec3);
    };
    const a = section(root);
    const b = section(tip);
    if (vertical) {
      this.loft([a, b], paint);
    } else {
      this.loft(root.x < tip.x ? [b, a] : [a, b], paint);
    }
  }

  cylinder(center: Vec3, radius: number, length: number, sides: number, paint: Paint, axis: 'x' | 'y' | 'z' = 'z', taper = 1) {
    const ring = (offset: number, r: number): Vec3[] => Array.from({ length: sides }, (_, i) => {
      const angle = (i / sides) * Math.PI * 2 + Math.PI / sides;
      const u = Math.cos(angle) * r;
      const v = Math.sin(angle) * r;
      if (axis === 'z') return [center[0] + u, center[1] + v, center[2] + offset];
      if (axis === 'x') return [center[0] + offset, center[1] + u, center[2] + v];
      return [center[0] + u, center[1] + offset, center[2] + v];
    });
    const rings = [ring(-length / 2, radius), ring(length / 2, radius * taper)];
    this.loft(axis === 'z' ? rings : [rings[1], rings[0]], paint);
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    geometry.setAttribute('liveryMask', new BufferAttribute(new Float32Array(this.masks), 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const WHITE: Paint = { color: [0.93, 0.94, 0.96] };
const BELLY: Paint = { color: [0.66, 0.69, 0.74] };
const WING: Paint = { color: [0.6, 0.63, 0.67] };
const METAL: Paint = { color: [0.74, 0.76, 0.8] };
const DARK: Paint = { color: [0.05, 0.07, 0.1] };
const LIVERY: Paint = { color: [1, 1, 1], mask: 1 };

function octagon(z: number, radius: number, height = radius, lift = 0): Vec3[] {
  return Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return [Math.cos(angle) * radius, Math.sin(angle) * height + lift, z] as Vec3;
  });
}

function fuselage(builder: MeshBuilder, length: number, radius: number) {
  const half = length / 2;
  const stations: Array<[number, number, number, number]> = [
    [-half, 0.18, 0.5, radius * 0.55],
    [-half + length * 0.09, 0.45, 0.62, radius * 0.38],
    [-half + length * 0.22, 0.92, 0.95, radius * 0.05],
    [half - length * 0.16, 1, 1, 0],
    [half - length * 0.07, 0.86, 0.84, -radius * 0.05],
    [half - length * 0.025, 0.5, 0.48, -radius * 0.12],
    [half, 0.08, 0.08, -radius * 0.15],
  ];
  const rings = stations.map(([z, w, h, lift]) => octagon(z, radius * w, radius * h, lift));
  builder.loft(rings, (ring, side) => {
    if (side === 5 || side === 6) return BELLY;
    if (ring === 4 && (side === 1 || side === 2)) return DARK;
    if ((side === 0 || side === 3) && ring >= 1 && ring <= 3) return LIVERY;
    return WHITE;
  });
}

function jetEngine(builder: MeshBuilder, x: number, y: number, z: number, radius: number, length: number) {
  builder.cylinder([x, y, z], radius, length, 8, METAL, 'z', 0.82);
  builder.cylinder([x, y, z + length / 2 + 0.05], radius * 0.82, 0.1, 8, DARK);
  builder.box([x, y + radius * 1.05, z - length * 0.1], [0.35, radius * 0.9, length * 0.7], WING);
}

function airliner(engines: 2 | 4, length: number): BufferGeometry {
  const b = new MeshBuilder();
  const r = length * 0.052;
  fuselage(b, length, r);
  const span = length * 0.96;
  for (const side of [-1, 1]) {
    b.surface(
      { x: side * r * 0.8, y: -r * 0.35, lead: length * 0.12, trail: -length * 0.08, thick: r * 0.5 },
      { x: side * span / 2, y: r * 0.35, lead: -length * 0.14, trail: -length * 0.22, thick: r * 0.14 },
      WING,
    );
    b.surface(
      { x: side * span / 2, y: r * 0.35, lead: -length * 0.15, trail: -length * 0.22, thick: r * 0.1 },
      { x: side * span / 2 * 1.01, y: r * 1.25, lead: -length * 0.19, trail: -length * 0.235, thick: r * 0.06 },
      LIVERY,
      true,
    );
    b.surface(
      { x: side * r * 0.4, y: r * 0.3, lead: -length * 0.36, trail: -length * 0.47, thick: r * 0.25 },
      { x: side * length * 0.19, y: r * 0.55, lead: -length * 0.46, trail: -length * 0.51, thick: r * 0.08 },
      WING,
    );
    const offsets = engines === 4 ? [0.21, 0.36] : [0.18];
    for (const offset of offsets) {
      const x = side * span * offset;
      jetEngine(b, x, -r * 1.05 + Math.abs(x) * 0.02, length * 0.1 - Math.abs(x) * 0.25, r * (engines === 4 ? 0.48 : 0.6), length * 0.12);
    }
  }
  b.surface(
    { x: 0, y: r * 0.6, lead: -length * 0.3, trail: -length * 0.47, thick: r * 0.28 },
    { x: 0, y: r * 3.6, lead: -length * 0.43, trail: -length * 0.51, thick: r * 0.12 },
    LIVERY,
    true,
  );
  return b.build();
}

function lightAircraft(): BufferGeometry {
  const b = new MeshBuilder();
  const length = 8.3;
  const r = 0.62;
  fuselage(b, length, r);
  for (const side of [-1, 1]) {
    b.surface(
      { x: side * 0.3, y: r * 1.05, lead: 1.4, trail: 0, thick: 0.28 },
      { x: side * 5.5, y: r * 1.15, lead: 1.25, trail: 0.05, thick: 0.18 },
      LIVERY,
    );
    b.surface(
      { x: side * 0.2, y: 0.15, lead: -3.1, trail: -3.9, thick: 0.12 },
      { x: side * 1.7, y: 0.15, lead: -3.3, trail: -3.9, thick: 0.08 },
      WHITE,
    );
    b.box([side * 0.8, -0.35, 0.9], [0.06, 0.9, 0.1], METAL);
  }
  b.surface(
    { x: 0, y: 0.4, lead: -2.7, trail: -3.95, thick: 0.12 },
    { x: 0, y: 1.6, lead: -3.4, trail: -3.95, thick: 0.08 },
    LIVERY,
    true,
  );
  b.box([0, 0, length / 2 + 0.1], [2.1, 0.12, 0.05], DARK);
  return b.build();
}

function helicopter(): BufferGeometry {
  const b = new MeshBuilder();
  const rings = [
    octagon(-1.6, 0.5, 0.55, 0.3),
    octagon(-0.8, 1.05, 1.05, 0.1),
    octagon(1.0, 1.1, 1.1, 0),
    octagon(2.1, 0.75, 0.85, -0.1),
    octagon(2.6, 0.2, 0.3, -0.2),
  ];
  b.loft(rings, (ring, side) => (ring === 2 && (side === 1 || side === 2) ? DARK : ring === 1 ? LIVERY : WHITE));
  b.box([0, 0.4, -4.3], [0.25, 0.35, 5.6], WHITE);
  b.box([0, 1.0, -6.9], [0.12, 1.3, 0.7], LIVERY);
  b.box([0, 1.35, 0], [0.18, 0.5, 0.18], METAL);
  for (const angle of [0, Math.PI / 2]) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    b.quad([-5.5 * c - 0.15 * s, 1.62, -5.5 * s + 0.15 * c], [5.5 * c - 0.15 * s, 1.62, 5.5 * s + 0.15 * c],
      [5.5 * c + 0.15 * s, 1.62, 5.5 * s - 0.15 * c], [-5.5 * c + 0.15 * s, 1.62, -5.5 * s - 0.15 * c], DARK);
  }
  for (const side of [-1, 1]) b.box([side * 0.8, -1.15, 0.2], [0.1, 0.1, 3.0], METAL);
  return b.build();
}

const FOIL: Paint = { color: [0.86, 0.64, 0.22] };
const SOLAR: Paint = { color: [0.05, 0.09, 0.28], mask: 0.12 };
const SOLAR_FRAME: Paint = { color: [0.55, 0.58, 0.64] };
const RADIATOR: Paint = { color: [0.9, 0.92, 0.95] };

function solarWing(b: MeshBuilder, side: number, inner: number, outer: number, height: number, cells = 4) {
  b.box([side * (inner + outer) / 2, 0, 0], [outer - inner, 0.12, 0.08], SOLAR_FRAME);
  const span = (outer - inner) / cells;
  for (let i = 0; i < cells; i++) {
    const x = side * (inner + span * (i + 0.5));
    b.box([x, 0, 0], [span * 0.94, 0.06, height], SOLAR);
  }
}

function genericSatellite(): BufferGeometry {
  const b = new MeshBuilder();
  b.box([0, 0, 0], [2.2, 2.0, 2.8], FOIL);
  b.box([0, 0, 1.45], [1.6, 1.4, 0.1], { color: [0.4, 0.42, 0.46], mask: 1 });
  for (const side of [-1, 1]) solarWing(b, side, 1.3, 8.5, 2.4);
  b.cylinder([0, -1.4, 0.3], 0.8, 0.3, 10, RADIATOR, 'y', 0.25);
  b.box([0, 1.25, -0.6], [0.1, 0.5, 0.1], METAL);
  return b.build();
}

function starlinkSatellite(): BufferGeometry {
  const b = new MeshBuilder();
  b.box([0, 0, 0], [1.4, 0.25, 2.8], { color: [0.55, 0.57, 0.62] });
  b.box([0, 0.14, 0], [1.2, 0.04, 2.5], { color: [0.2, 0.22, 0.26], mask: 0.4 });
  b.box([0, 0.1, -1.5], [0.12, 0.12, 0.6], METAL);
  for (let i = 0; i < 6; i++) b.box([0, 0.35, -2.0 - i * 1.25], [2.6, 0.05, 1.18], SOLAR);
  return b.build();
}

function spaceStation(): BufferGeometry {
  const b = new MeshBuilder();
  b.box([0, 0, 0], [92, 1.6, 1.8], SOLAR_FRAME);
  const module: Paint = { color: [0.88, 0.89, 0.9] };
  b.cylinder([0, -1.5, 8], 2.1, 30, 10, module);
  b.cylinder([0, -1.5, -12], 2.0, 14, 10, module);
  b.cylinder([4.5, -1.5, 14], 2.0, 8, 10, module, 'x');
  b.cylinder([-4.5, -1.5, 14], 2.0, 8, 10, module, 'x');
  b.cylinder([0, -1.5, -24], 1.5, 10, 10, { color: [0.75, 0.75, 0.72], mask: 0.2 });
  const array: Paint = { color: [0.42, 0.28, 0.1] };
  for (const side of [-1, 1]) {
    for (const x of [33, 43]) {
      for (const z of [-1, 1]) b.box([side * x, 0, z * 9], [4.2, 0.08, 16], array);
    }
    b.box([side * 18, 0, -6], [3, 0.08, 9], RADIATOR);
  }
  return b.build();
}

export const MODEL_LENGTH_M = {
  twin: 44,
  heavy: 68,
  light: 8.3,
  rotor: 12,
  satellite: 17,
  starlink: 10,
  station: 92,
} as const;

export type AircraftModel = 'twin' | 'heavy' | 'light' | 'rotor';
export type SatelliteModel = 'satellite' | 'starlink' | 'station';

export function createAircraftGeometries(): Record<AircraftModel, BufferGeometry> {
  return {
    twin: airliner(2, MODEL_LENGTH_M.twin),
    heavy: airliner(4, MODEL_LENGTH_M.heavy),
    light: lightAircraft(),
    rotor: helicopter(),
  };
}

export function createSatelliteGeometries(): Record<SatelliteModel, BufferGeometry> {
  return {
    satellite: genericSatellite(),
    starlink: starlinkSatellite(),
    station: spaceStation(),
  };
}

export const MODEL_UP = new Vector3(0, 1, 0);
