import { Geometry } from '@luma.gl/engine';

type Vec3 = [number, number, number];

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

function pushTri(vertices: number[], normals: number[], a: Vec3, b: Vec3, c: Vec3) {
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
  const length = Math.hypot(nx, ny, nz) || 1;
  const normal = [nx / length, ny / length, nz / length];
  normals.push(...normal, ...normal, ...normal);
}

function pushQuad(
  vertices: number[],
  normals: number[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
) {
  pushTri(vertices, normals, a, b, c);
  pushTri(vertices, normals, a, c, d);
}

function pushPrismXY(
  vertices: number[],
  normals: number[],
  outline: Array<[number, number]>,
  bottom: number,
  top: number,
) {
  const bottomRing = outline.map(([x, y]) => [x, y, bottom] as Vec3);
  const topRing = outline.map(([x, y]) => [x, y, top] as Vec3);

  for (let index = 1; index < outline.length - 1; index += 1) {
    pushTri(vertices, normals, topRing[0], topRing[index], topRing[index + 1]);
    pushTri(vertices, normals, bottomRing[0], bottomRing[index + 1], bottomRing[index]);
  }

  for (let index = 0; index < outline.length; index += 1) {
    const next = (index + 1) % outline.length;
    pushQuad(vertices, normals, bottomRing[index], bottomRing[next], topRing[next], topRing[index]);
  }
}

function pushPrismYZ(
  vertices: number[],
  normals: number[],
  outline: Array<[number, number]>,
  left: number,
  right: number,
) {
  const leftFace = outline.map(([y, z]) => [left, y, z] as Vec3);
  const rightFace = outline.map(([y, z]) => [right, y, z] as Vec3);

  for (let index = 1; index < outline.length - 1; index += 1) {
    pushTri(vertices, normals, rightFace[0], rightFace[index], rightFace[index + 1]);
    pushTri(vertices, normals, leftFace[0], leftFace[index + 1], leftFace[index]);
  }

  for (let index = 0; index < outline.length; index += 1) {
    const next = (index + 1) % outline.length;
    pushQuad(vertices, normals, leftFace[index], rightFace[index], rightFace[next], leftFace[next]);
  }
}

function pushFuselage(vertices: number[], normals: number[]) {
  const stations = [
    { y: 34, rx: 0.22, rz: 0.18 },
    { y: 28, rx: 2.1, rz: 1.7 },
    { y: 18, rx: 3.35, rz: 2.75 },
    { y: 1, rx: 3.9, rz: 3.15 },
    { y: -17, rx: 2.75, rz: 2.35 },
    { y: -28, rx: 0.45, rz: 0.38 },
  ];
  const segments = 10;
  const rings = stations.map((station) => Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return [
      Math.sin(angle) * station.rx,
      station.y,
      Math.cos(angle) * station.rz,
    ] as Vec3;
  }));

  for (let station = 0; station < rings.length - 1; station += 1) {
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      pushQuad(
        vertices,
        normals,
        rings[station][index],
        rings[station][next],
        rings[station + 1][next],
        rings[station + 1][index],
      );
    }
  }
}

function pushEngine(
  vertices: number[],
  normals: number[],
  centerX: number,
  centerZ: number,
) {
  const stations = [
    { y: 5.5, radius: 2.35 },
    { y: 2.5, radius: 2.55 },
    { y: -5.5, radius: 2.3 },
    { y: -7.5, radius: 1.65 },
  ];
  const segments = 10;
  const rings = stations.map((station) => Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return [
      centerX + Math.cos(angle) * station.radius,
      station.y,
      centerZ + Math.sin(angle) * station.radius,
    ] as Vec3;
  }));

  for (let station = 0; station < rings.length - 1; station += 1) {
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      pushQuad(
        vertices,
        normals,
        rings[station][index],
        rings[station][next],
        rings[station + 1][next],
        rings[station + 1][index],
      );
    }
  }
}

function pushDiscY(
  vertices: number[],
  normals: number[],
  center: Vec3,
  radius: number,
  facingForward: boolean,
) {
  const segments = 10;
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const a = [
      center[0] + Math.cos((index / segments) * Math.PI * 2) * radius,
      center[1],
      center[2] + Math.sin((index / segments) * Math.PI * 2) * radius,
    ] as Vec3;
    const b = [
      center[0] + Math.cos((next / segments) * Math.PI * 2) * radius,
      center[1],
      center[2] + Math.sin((next / segments) * Math.PI * 2) * radius,
    ] as Vec3;
    pushTri(vertices, normals, center, facingForward ? b : a, facingForward ? a : b);
  }
}

function pushOctahedron(
  vertices: number[],
  normals: number[],
  center: Vec3,
  radius: number,
) {
  const [x, y, z] = center;
  const top: Vec3 = [x, y, z + radius];
  const bottom: Vec3 = [x, y, z - radius];
  const ring: Vec3[] = [
    [x + radius, y, z],
    [x, y + radius, z],
    [x - radius, y, z],
    [x, y - radius, z],
  ];

  for (let index = 0; index < ring.length; index += 1) {
    const next = (index + 1) % ring.length;
    pushTri(vertices, normals, top, ring[index], ring[next]);
    pushTri(vertices, normals, bottom, ring[next], ring[index]);
  }
}

export function createAircraftGeometries() {
  const airframeVertices: number[] = [];
  const airframeNormals: number[] = [];
  pushFuselage(airframeVertices, airframeNormals);

  // Swept, slightly thick wings read clearly from both orbital and close views.
  pushPrismXY(airframeVertices, airframeNormals, [
    [-3.2, 8], [-34, -6], [-33, -10.5], [-3.5, -7.5],
  ], -0.42, 0.48);
  pushPrismXY(airframeVertices, airframeNormals, [
    [3.2, 8], [3.5, -7.5], [33, -10.5], [34, -6],
  ], -0.42, 0.48);

  pushPrismXY(airframeVertices, airframeNormals, [
    [-1.8, -17], [-13.5, -23], [-12.5, -26], [-1.4, -23.2],
  ], 0.15, 0.75);
  pushPrismXY(airframeVertices, airframeNormals, [
    [1.8, -17], [1.4, -23.2], [12.5, -26], [13.5, -23],
  ], 0.15, 0.75);
  pushPrismYZ(airframeVertices, airframeNormals, [
    [-16.5, 1.25], [-22.5, 10.5], [-27.5, 1.1],
  ], -0.48, 0.48);

  const engineVertices: number[] = [];
  const engineNormals: number[] = [];
  pushEngine(engineVertices, engineNormals, -11.5, -2.45);
  pushEngine(engineVertices, engineNormals, 11.5, -2.45);

  const glazingVertices: number[] = [];
  const glazingNormals: number[] = [];
  pushQuad(
    glazingVertices,
    glazingNormals,
    [0, 27.2, 1.25],
    [-1.8, 22.5, 2.35],
    [-2.05, 16.6, 2.95],
    [0, 15.5, 3.22],
  );
  pushQuad(
    glazingVertices,
    glazingNormals,
    [0, 27.2, 1.25],
    [0, 15.5, 3.22],
    [2.05, 16.6, 2.95],
    [1.8, 22.5, 2.35],
  );
  pushDiscY(glazingVertices, glazingNormals, [-11.5, 5.58, -2.45], 1.78, true);
  pushDiscY(glazingVertices, glazingNormals, [11.5, 5.58, -2.45], 1.78, true);

  const portLightVertices: number[] = [];
  const portLightNormals: number[] = [];
  pushOctahedron(portLightVertices, portLightNormals, [-34.1, -7.8, 0.2], 1.25);

  const starboardLightVertices: number[] = [];
  const starboardLightNormals: number[] = [];
  pushOctahedron(starboardLightVertices, starboardLightNormals, [34.1, -7.8, 0.2], 1.25);

  return {
    airframe: makeGeometry('aerogrid-aircraft-airframe', airframeVertices, airframeNormals),
    engines: makeGeometry('aerogrid-aircraft-engines', engineVertices, engineNormals),
    glazing: makeGeometry('aerogrid-aircraft-glazing', glazingVertices, glazingNormals),
    portLight: makeGeometry('aerogrid-aircraft-port-light', portLightVertices, portLightNormals),
    starboardLight: makeGeometry('aerogrid-aircraft-starboard-light', starboardLightVertices, starboardLightNormals),
  };
}

export function createAircraftGeometry() {
  return createAircraftGeometries().airframe;
}

export function createSatelliteGeometry() {
  const vertices: number[] = [];
  const normals: number[] = [];

  const points: Vec3[] = [
    [-2, -2, -2], [2, -2, -2], [2, 2, -2], [-2, 2, -2],
    [-2, -2, 2], [2, -2, 2], [2, 2, 2], [-2, 2, 2],
  ];
  const faces = [
    [0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1],
    [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0],
  ];
  faces.forEach(([a, b, c, d]) => {
    pushTri(vertices, normals, points[a], points[b], points[c]);
    pushTri(vertices, normals, points[a], points[c], points[d]);
  });

  pushTri(vertices, normals, [-2, -0.3, 0], [-13, -4, 0], [-13, 4, 0]);
  pushTri(vertices, normals, [-2, -0.3, 0], [-13, 4, 0], [-2, 0.3, 0]);
  pushTri(vertices, normals, [2, -0.3, 0], [13, 4, 0], [13, -4, 0]);
  pushTri(vertices, normals, [2, -0.3, 0], [2, 0.3, 0], [13, 4, 0]);

  return makeGeometry('aerogrid-satellite-model', vertices, normals);
}
