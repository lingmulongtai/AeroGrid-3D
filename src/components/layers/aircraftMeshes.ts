type Mesh = {
  positions: { value: Float32Array; size: 3 };
  normals: { value: Float32Array; size: 3 };
  texCoords: { value: Float32Array; size: 2 };
};

type Vertex = [number, number, number];

export const FIXED_WING_MESH = createFixedWingMesh();
export const HELICOPTER_MESH = createHelicopterMesh();

function createFixedWingMesh(): Mesh {
  const triangles: Vertex[][] = [];

  const nose: Vertex = [0, 0.64, 0.02];
  const tail: Vertex = [0, -0.54, 0];
  const top: Vertex = [0, 0.02, 0.13];
  const bottom: Vertex = [0, 0.0, -0.08];
  const left: Vertex = [-0.105, 0.02, 0];
  const right: Vertex = [0.105, 0.02, 0];

  pushQuad(triangles, nose, top, right, [0.02, 0.34, 0.03]);
  pushQuad(triangles, nose, right, bottom, [0.02, 0.34, -0.03]);
  pushQuad(triangles, nose, bottom, left, [-0.02, 0.34, -0.03]);
  pushQuad(triangles, nose, left, top, [-0.02, 0.34, 0.03]);
  pushQuad(triangles, tail, right, top, [0.0, -0.34, 0.02]);
  pushQuad(triangles, tail, bottom, right, [0.0, -0.34, -0.02]);
  pushQuad(triangles, tail, left, bottom, [0.0, -0.34, -0.02]);
  pushQuad(triangles, tail, top, left, [0.0, -0.34, 0.02]);

  addWing(triangles, -1);
  addWing(triangles, 1);
  addTailPlane(triangles, -1);
  addTailPlane(triangles, 1);

  triangles.push(
    [[0, -0.43, 0.05], [0, -0.55, 0.30], [0.05, -0.47, 0.05]],
    [[0, -0.43, 0.05], [-0.05, -0.47, 0.05], [0, -0.55, 0.30]],
  );

  return toMesh(triangles);
}

function createHelicopterMesh(): Mesh {
  const triangles: Vertex[][] = [];

  const nose: Vertex = [0, 0.34, 0.02];
  const tail: Vertex = [0, -0.72, 0.02];
  const top: Vertex = [0, 0.0, 0.16];
  const bottom: Vertex = [0, 0.0, -0.08];
  const left: Vertex = [-0.13, 0.02, 0.01];
  const right: Vertex = [0.13, 0.02, 0.01];

  pushQuad(triangles, nose, top, right, [0, 0.18, 0.04]);
  pushQuad(triangles, nose, right, bottom, [0, 0.18, -0.02]);
  pushQuad(triangles, nose, bottom, left, [0, 0.18, -0.02]);
  pushQuad(triangles, nose, left, top, [0, 0.18, 0.04]);
  pushQuad(triangles, tail, right, top, [0, -0.2, 0.02]);
  pushQuad(triangles, tail, bottom, right, [0, -0.2, -0.02]);
  pushQuad(triangles, tail, left, bottom, [0, -0.2, -0.02]);
  pushQuad(triangles, tail, top, left, [0, -0.2, 0.02]);

  addBlade(triangles, [-0.56, -0.015, 0.22], [0.56, 0.015, 0.22], 0.028);
  addBlade(triangles, [-0.015, -0.56, 0.225], [0.015, 0.56, 0.225], 0.028);
  addBlade(triangles, [-0.08, -0.76, 0.08], [0.08, -0.76, 0.08], 0.02);

  return toMesh(triangles);
}

function addWing(triangles: Vertex[][], side: -1 | 1) {
  const rootFront: Vertex = [side * 0.05, 0.09, 0.01];
  const rootBack: Vertex = [side * 0.06, -0.18, -0.01];
  const tip: Vertex = [side * 0.58, -0.08, 0.015];
  triangles.push([rootFront, tip, rootBack]);
}

function addTailPlane(triangles: Vertex[][], side: -1 | 1) {
  const rootFront: Vertex = [side * 0.035, -0.39, 0.04];
  const rootBack: Vertex = [side * 0.035, -0.52, 0.02];
  const tip: Vertex = [side * 0.26, -0.48, 0.05];
  triangles.push([rootFront, tip, rootBack]);
}

function addBlade(triangles: Vertex[][], a: Vertex, b: Vertex, halfWidth: number) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.max(0.001, Math.hypot(dx, dy));
  const px = (-dy / len) * halfWidth;
  const py = (dx / len) * halfWidth;
  const p1: Vertex = [a[0] + px, a[1] + py, a[2]];
  const p2: Vertex = [b[0] + px, b[1] + py, b[2]];
  const p3: Vertex = [b[0] - px, b[1] - py, b[2]];
  const p4: Vertex = [a[0] - px, a[1] - py, a[2]];
  triangles.push([p1, p2, p3], [p1, p3, p4]);
}

function pushQuad(triangles: Vertex[][], a: Vertex, b: Vertex, c: Vertex, center: Vertex) {
  triangles.push([a, b, c], [a, c, center]);
}

function toMesh(triangles: Vertex[][]): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const texCoords: number[] = [];

  for (const tri of triangles) {
    const normal = faceNormal(tri[0], tri[1], tri[2]);
    for (const vertex of tri) {
      positions.push(vertex[0], vertex[1], vertex[2]);
      normals.push(normal[0], normal[1], normal[2]);
      texCoords.push(0, 0);
    }
  }

  return {
    positions: { value: new Float32Array(positions), size: 3 },
    normals: { value: new Float32Array(normals), size: 3 },
    texCoords: { value: new Float32Array(texCoords), size: 2 },
  };
}

function faceNormal(a: Vertex, b: Vertex, c: Vertex): Vertex {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.max(0.0001, Math.hypot(nx, ny, nz));
  return [nx / len, ny / len, nz / len];
}
