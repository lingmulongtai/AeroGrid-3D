import { Geometry } from '@luma.gl/engine';

function makeGeometry(id: string, vertices: number[], normals: number[]) {
  return new Geometry({
    id,
    topology: 'triangle-list',
    attributes: {
      POSITION: { size: 3, value: new Float32Array(vertices) },
      NORMAL: { size: 3, value: new Float32Array(normals) },
    },
  });
}

function pushTri(vertices: number[], normals: number[], a: number[], b: number[], c: number[]) {
  vertices.push(...a, ...b, ...c);
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  const n = [nx / len, ny / len, nz / len];
  normals.push(...n, ...n, ...n);
}

export function createAircraftGeometry() {
  const vertices: number[] = [];
  const normals: number[] = [];

  // Long, low-poly aircraft silhouette in local meters. +Y is the nose.
  const nose = [0, 32, 0];
  const tail = [0, -25, 0];
  const leftMid = [-3.2, 1, 1.4];
  const rightMid = [3.2, 1, 1.4];
  const leftLow = [-2.4, 0, -1.4];
  const rightLow = [2.4, 0, -1.4];

  pushTri(vertices, normals, nose, leftMid, rightMid);
  pushTri(vertices, normals, nose, rightLow, leftLow);
  pushTri(vertices, normals, nose, rightMid, rightLow);
  pushTri(vertices, normals, nose, leftLow, leftMid);
  pushTri(vertices, normals, tail, rightMid, leftMid);
  pushTri(vertices, normals, tail, leftLow, rightLow);
  pushTri(vertices, normals, tail, leftMid, leftLow);
  pushTri(vertices, normals, tail, rightLow, rightMid);

  // Main wings.
  pushTri(vertices, normals, [-3, 2, 0], [-28, -6, 0.2], [-2, -8, 0.3]);
  pushTri(vertices, normals, [3, 2, 0], [2, -8, 0.3], [28, -6, 0.2]);

  // Tail plane and vertical stabilizer.
  pushTri(vertices, normals, [-2, -18, 0.2], [-11, -24, 0.4], [0, -22, 0.6]);
  pushTri(vertices, normals, [2, -18, 0.2], [0, -22, 0.6], [11, -24, 0.4]);
  pushTri(vertices, normals, [0, -18, 1], [0, -25, 7], [0, -28, 0.5]);

  return makeGeometry('aerogrid-aircraft-model', vertices, normals);
}

export function createSatelliteGeometry() {
  const vertices: number[] = [];
  const normals: number[] = [];

  // Central bus.
  const p = [
    [-2, -2, -2], [2, -2, -2], [2, 2, -2], [-2, 2, -2],
    [-2, -2, 2], [2, -2, 2], [2, 2, 2], [-2, 2, 2],
  ];
  const faces = [
    [0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1],
    [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0],
  ];
  faces.forEach(([a, b, c, d]) => {
    pushTri(vertices, normals, p[a], p[b], p[c]);
    pushTri(vertices, normals, p[a], p[c], p[d]);
  });

  // Solar panels.
  pushTri(vertices, normals, [-2, -0.3, 0], [-13, -4, 0], [-13, 4, 0]);
  pushTri(vertices, normals, [-2, -0.3, 0], [-13, 4, 0], [-2, 0.3, 0]);
  pushTri(vertices, normals, [2, -0.3, 0], [13, 4, 0], [13, -4, 0]);
  pushTri(vertices, normals, [2, -0.3, 0], [2, 0.3, 0], [13, 4, 0]);

  return makeGeometry('aerogrid-satellite-model', vertices, normals);
}
