import {
  BufferAttribute,
  BufferGeometry,
  Frustum,
  Group,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
  LinearMipmapLinearFilter,
  LinearFilter,
  type IUniform,
  type WebGLRenderer,
} from 'three';
import { DEG, EARTH_RADIUS_KM, lonLatToVector, mercatorYToLatitude } from './geo';
import { SURFACE_FRAGMENT, TILE_VERTEX } from './shaders';

export type TileScheme = 'mercator' | 'geographic';

export interface TileSource {
  id: string;
  scheme: TileScheme;
  url: (z: number, x: number, y: number) => string;
  /** Lowest level that is fetched and rendered. Coarser levels only guide traversal. */
  minZoom: number;
  maxZoom: number;
  tileSize: number;
  /** Height above the ellipsoid used to lift an overlay above the layer below it. */
  liftKm?: number;
  /** Skip tiles whose centre lies poleward of this latitude. */
  latitudeLimit?: number;
  /** Treat uniform grey "no data" placeholder images as empty. */
  rejectPlaceholders?: boolean;
}

let probeContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function isPlaceholder(bitmap: ImageBitmap): boolean {
  if (!probeContext) {
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(16, 16) : Object.assign(document.createElement('canvas'), { width: 16, height: 16 });
    probeContext = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!probeContext) return false;
  }
  probeContext.drawImage(bitmap, 0, 0, 16, 16);
  const { data } = probeContext.getImageData(0, 0, 16, 16);
  let grey = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (r > 190 && r < 215 && Math.abs(r - g) < 6 && Math.abs(r - b) < 6) grey++;
  }
  return grey > 16 * 16 * 0.8;
}

type TileState = 'idle' | 'queued' | 'loading' | 'ready' | 'failed';

const tmpVector = new Vector3();
/** Each deeper level is lifted slightly so it wins the depth test over its fallback parent. */
export const LEVEL_LIFT_KM = 0.0006;
const tmpVector2 = new Vector3();

class Tile {
  readonly west: number;
  readonly east: number;
  readonly north: number;
  readonly south: number;
  readonly center: Vector3;
  readonly angularRadius: number;
  readonly sizeKm: number;
  children: Tile[] | null = null;
  state: TileState = 'idle';
  mesh: Mesh | null = null;
  texture: Texture | null = null;
  lastUsed = -1;
  priority = 0;
  failures = 0;
  retryAt = 0;
  /** The source has no imagery here (and therefore none deeper either). */
  empty = false;
  abort: AbortController | null = null;

  constructor(
    readonly source: TileSource,
    readonly z: number,
    readonly x: number,
    readonly y: number,
  ) {
    const scheme = source.scheme;
    const columns = scheme === 'mercator' ? 2 ** z : 2 ** (z + 1);
    const rows = 2 ** z;
    this.west = (x / columns) * 360 - 180;
    this.east = ((x + 1) / columns) * 360 - 180;
    if (scheme === 'mercator') {
      this.north = mercatorYToLatitude(y / rows);
      this.south = mercatorYToLatitude((y + 1) / rows);
    } else {
      this.north = 90 - (y / rows) * 180;
      this.south = 90 - ((y + 1) / rows) * 180;
    }
    const midLon = (this.west + this.east) / 2;
    const midLat = (this.north + this.south) / 2;
    this.center = lonLatToVector(midLon, midLat, 0).normalize();
    let radius = 0;
    for (const [lon, lat] of [
      [this.west, this.north], [this.east, this.north], [this.west, this.south], [this.east, this.south],
      [midLon, this.north], [midLon, this.south], [this.west, midLat], [this.east, midLat],
    ]) {
      radius = Math.max(radius, this.center.angleTo(lonLatToVector(lon, lat, 0, tmpVector).normalize()));
    }
    this.angularRadius = radius;
    const widthKm = EARTH_RADIUS_KM * (this.east - this.west) * DEG * Math.cos(midLat * DEG);
    const heightKm = EARTH_RADIUS_KM * Math.abs(this.north - this.south) * DEG;
    this.sizeKm = Math.max(widthKm, heightKm);
  }

  get key() { return `${this.z}/${this.x}/${this.y}`; }

  getChildren(): Tile[] {
    if (!this.children) {
      const { source, z, x, y } = this;
      this.children = [
        new Tile(source, z + 1, x * 2, y * 2),
        new Tile(source, z + 1, x * 2 + 1, y * 2),
        new Tile(source, z + 1, x * 2, y * 2 + 1),
        new Tile(source, z + 1, x * 2 + 1, y * 2 + 1),
      ];
    }
    return this.children;
  }
}

function buildTileGeometry(tile: Tile, liftKm: number): BufferGeometry {
  const segments = tile.z <= 2 ? 48 : tile.z <= 5 ? 24 : tile.z <= 9 ? 12 : 6;
  const grid = segments + 1;
  const skirtVertices = grid * 4;
  const positions = new Float32Array((grid * grid + skirtVertices) * 3);
  const uvs = new Float32Array((grid * grid + skirtVertices) * 2);
  const origin = tile.center.clone().multiplyScalar(EARTH_RADIUS_KM + liftKm);
  const skirtDepth = Math.min(30, Math.max(0.01, tile.sizeKm * 0.03));
  const mercator = tile.source.scheme === 'mercator';
  const rows = 2 ** tile.z;

  const latitudeAt = (v: number) => {
    if (mercator) return mercatorYToLatitude((tile.y + v) / rows);
    return tile.north + (tile.south - tile.north) * v;
  };

  const write = (index: number, lon: number, lat: number, altitude: number, u: number, v: number) => {
    lonLatToVector(lon, lat, altitude, tmpVector2).sub(origin);
    positions.set([tmpVector2.x, tmpVector2.y, tmpVector2.z], index * 3);
    uvs.set([u, v], index * 2);
  };

  for (let j = 0; j < grid; j++) {
    const v = j / segments;
    const lat = latitudeAt(v);
    for (let i = 0; i < grid; i++) {
      const u = i / segments;
      write(j * grid + i, tile.west + (tile.east - tile.west) * u, lat, liftKm, u, v);
    }
  }

  const indices: number[] = [];
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * grid + i;
      const b = a + 1;
      const c = a + grid;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Skirts hide hairline cracks where neighbouring tiles use different levels.
  let next = grid * grid;
  const edges: Array<(k: number) => number> = [
    (k) => k,
    (k) => (grid - 1) * grid + k,
    (k) => k * grid,
    (k) => k * grid + grid - 1,
  ];
  for (const edge of edges) {
    const start = next;
    for (let k = 0; k < grid; k++) {
      const source = edge(k);
      const u = uvs[source * 2];
      const v = uvs[source * 2 + 1];
      write(next++, tile.west + (tile.east - tile.west) * u, latitudeAt(v), liftKm - skirtDepth, u, v);
    }
    for (let k = 0; k < segments; k++) {
      const a = edge(k);
      const b = edge(k + 1);
      const c = start + k;
      const d = start + k + 1;
      indices.push(a, c, b, b, c, d, a, b, c, b, d, c);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export interface TileLayerOptions {
  renderer: WebGLRenderer;
  sharedUniforms: Record<string, IUniform>;
  materialUniforms: Record<string, IUniform>;
  renderOrder: number;
  anisotropy: number;
}

interface TraversalContext {
  camera: PerspectiveCamera;
  frustum: Frustum;
  cameraPosition: Vector3;
  horizonAngle: number;
  pixelsPerRadian: number;
  detail: number;
  frame: number;
  requests: Tile[];
}

/** One imagery source rendered as a screen-space-error driven quadtree. */
export class TileLayer {
  readonly group = new Group();
  private roots: Tile[];
  private loaded = new Set<Tile>();
  private visibleNow = new Set<Tile>();

  constructor(readonly source: TileSource, private options: TileLayerOptions) {
    this.group.name = `tiles:${source.id}`;
    this.roots = source.scheme === 'mercator'
      ? [new Tile(source, 0, 0, 0)]
      : [new Tile(source, 0, 0, 0), new Tile(source, 0, 1, 0)];
  }

  get loadedCount() { return this.loaded.size; }

  debug() {
    const visible = [...this.visibleNow].map((tile) => tile.z);
    const byZoom: Record<number, number> = {};
    for (const z of visible) byZoom[z] = (byZoom[z] ?? 0) + 1;
    return { id: this.source.id, loaded: this.loaded.size, inFlight: this.inFlight.size, visibleByZoom: byZoom, lastRequests: this.lastRequests };
  }

  private isVisible(tile: Tile, context: TraversalContext): boolean {
    const limit = this.source.latitudeLimit;
    if (limit !== undefined) {
      const nearestToEquator = tile.north > 0 && tile.south < 0 ? 0 : Math.min(Math.abs(tile.north), Math.abs(tile.south));
      if (nearestToEquator > limit) return false;
    }
    const cameraDir = tmpVector.copy(context.cameraPosition).normalize();
    const angle = tile.center.angleTo(cameraDir);
    if (angle - tile.angularRadius > context.horizonAngle + 0.004) return false;
    if (tile.angularRadius > Math.PI / 3) return true;
    const chord = 2 * EARTH_RADIUS_KM * Math.sin(tile.angularRadius / 2) * 1.05 + 0.2;
    const sphereCenter = tmpVector.copy(tile.center).multiplyScalar(EARTH_RADIUS_KM * Math.cos(tile.angularRadius / 2));
    const planes = context.frustum.planes;
    for (const plane of planes) {
      if (plane.distanceToPoint(sphereCenter) < -chord) return false;
    }
    return true;
  }

  private wantsSplit(tile: Tile, context: TraversalContext): boolean {
    if (tile.z >= this.source.maxZoom) return false;
    if (tile.z < 2) return true;
    const surfacePoint = tmpVector.copy(tile.center).multiplyScalar(EARTH_RADIUS_KM);
    const altitude = context.cameraPosition.length() - EARTH_RADIUS_KM;
    const distance = Math.max(surfacePoint.distanceTo(context.cameraPosition) - tile.sizeKm * 0.7, altitude * 0.95, 0.05);
    const projectedPixels = (tile.sizeKm / distance) * context.pixelsPerRadian;
    return projectedPixels > this.source.tileSize * context.detail;
  }

  private request(tile: Tile, context: TraversalContext, fallback: boolean) {
    if (tile.state === 'ready' || tile.state === 'loading' || tile.z < this.source.minZoom) return;
    if (tile.state === 'failed' && (tile.failures > 2 || performance.now() < tile.retryAt)) return;
    tile.priority = this.priorityFor(tile, context, fallback);
    context.requests.push(tile);
  }

  /** Lower is sooner: the globe skeleton, then detail nearest the screen centre. */
  private priorityFor(tile: Tile, context: TraversalContext, fallback: boolean): number {
    const point = tmpVector.copy(tile.center).multiplyScalar(EARTH_RADIUS_KM).project(context.camera);
    const screenDistance = Math.min(2, Math.hypot(point.x, point.y));
    if (tile.z <= 3) return -10 + tile.z;
    return screenDistance * 2 + (fallback ? 0.8 : 0) + (point.z > 1 ? 4 : 0);
  }

  /**
   * Selects the deepest fully-covered set of tiles. Returns true when the
   * tile's area is covered (rendered by it or its descendants, or nothing is
   * needed there). All required levels are requested in parallel so detail
   * does not have to cascade one level at a time.
   */
  private visit(tile: Tile, context: TraversalContext): boolean {
    if (tile.empty || !this.isVisible(tile, context)) return true;
    tile.lastUsed = context.frame;
    const virtual = tile.z < this.source.minZoom;

    if (this.wantsSplit(tile, context)) {
      // Ready children are drawn even when siblings are still loading; the
      // parent stays underneath (deeper levels sit a few metres higher).
      let covered = true;
      for (const child of tile.getChildren()) {
        if (!this.visit(child, context)) covered = false;
      }
      if (covered) return true;
      if (virtual) return true;
      if (tile.state === 'ready') {
        this.renderList.push(tile);
        return true;
      }
      // Coarse fallbacks are fetched sparsely; the wanted detail level comes first.
      if (tile.z <= 4 || tile.z % 3 === 0) this.request(tile, context, true);
      return false;
    }

    if (virtual) return true;
    if (tile.state === 'ready') {
      this.renderList.push(tile);
      return true;
    }
    this.request(tile, context, false);
    return false;
  }

  private renderList: Tile[] = [];

  update(context: Omit<TraversalContext, 'requests'>): Tile[] {
    const full: TraversalContext = { ...context, requests: [] };
    this.visibleNow.clear();
    this.renderList.length = 0;
    for (const root of this.roots) this.visit(root, full);
    for (const tile of this.renderList) if (tile.mesh) this.visibleNow.add(tile);
    for (const tile of this.loaded) {
      if (tile.mesh) tile.mesh.visible = this.visibleNow.has(tile);
    }
    // Abort in-flight downloads that scrolled out of view.
    for (const tile of this.inFlight) {
      if (tile.lastUsed < context.frame - 2) {
        tile.abort?.abort();
      }
    }
    this.lastRequests = full.requests.length;
    return full.requests;
  }

  private lastRequests = 0;

  private inFlight = new Set<Tile>();

  async load(tile: Tile, onSettled: () => void) {
    tile.state = 'loading';
    tile.abort = new AbortController();
    this.inFlight.add(tile);
    try {
      const response = await fetch(this.source.url(tile.z, tile.x, tile.y), { signal: tile.abort.signal, mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      if (this.source.rejectPlaceholders && isPlaceholder(bitmap)) {
        bitmap.close();
        tile.empty = true;
        tile.state = 'failed';
        tile.failures = 99;
        return;
      }
      const texture = new Texture(bitmap as unknown as HTMLImageElement);
      texture.flipY = false;
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = this.options.anisotropy;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.magFilter = LinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      tile.texture = texture;
      tile.mesh = this.createMesh(tile, texture);
      tile.state = 'ready';
      this.loaded.add(tile);
    } catch (error) {
      tile.state = (error as Error).name === 'AbortError' ? 'idle' : 'failed';
      if (tile.state === 'failed') {
        tile.failures++;
        tile.retryAt = performance.now() + 2500 * tile.failures;
      }
    } finally {
      tile.abort = null;
      this.inFlight.delete(tile);
      onSettled();
    }
  }

  private createMesh(tile: Tile, texture: Texture): Mesh {
    const material = new ShaderMaterial({
      vertexShader: TILE_VERTEX,
      fragmentShader: SURFACE_FRAGMENT,
      uniforms: {
        ...this.options.sharedUniforms,
        ...this.options.materialUniforms,
        map: { value: texture },
        hasMap: { value: 1 },
      },
    });
    const lift = (this.source.liftKm ?? 0) + tile.z * LEVEL_LIFT_KM;
    const mesh = new Mesh(buildTileGeometry(tile, lift), material);
    mesh.position.copy(tile.center).multiplyScalar(EARTH_RADIUS_KM + lift);
    mesh.renderOrder = this.options.renderOrder + tile.z * 0.001;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
    this.options.renderer.initTexture(texture);
    return mesh;
  }

  /** Release GPU memory for tiles that have not been needed recently. */
  evict(maxTiles: number, frame: number) {
    if (this.loaded.size <= maxTiles) return;
    const candidates = [...this.loaded]
      .filter((tile) => tile.lastUsed < frame - 30 && tile.z > this.source.minZoom)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    const excess = this.loaded.size - maxTiles;
    for (const tile of candidates.slice(0, excess)) this.release(tile);
  }

  private release(tile: Tile) {
    if (tile.mesh) {
      this.group.remove(tile.mesh);
      tile.mesh.geometry.dispose();
      (tile.mesh.material as ShaderMaterial).dispose();
      tile.mesh = null;
    }
    if (tile.texture) {
      (tile.texture.image as ImageBitmap | undefined)?.close?.();
      tile.texture.dispose();
      tile.texture = null;
    }
    tile.state = 'idle';
    this.loaded.delete(tile);
  }

  dispose() {
    for (const tile of this.inFlight) tile.abort?.abort();
    for (const tile of [...this.loaded]) this.release(tile);
    this.group.removeFromParent();
  }
}

/** Shares a bounded download budget across layers, nearest-to-centre first. */
export class TileScheduler {
  active = 0;
  private queue: Array<{ layer: TileLayer; tile: Tile }> = [];
  onLoaded: () => void = () => undefined;

  constructor(public maxConcurrent: number) {}

  /** Replaces the wanted list; downloads continue between frames as slots free up. */
  schedule(entries: Array<{ layer: TileLayer; tiles: Tile[] }>) {
    this.queue = entries
      .flatMap(({ layer, tiles }) => tiles.map((tile) => ({ layer, tile })))
      .sort((a, b) => b.tile.priority - a.tile.priority);
    this.pump();
  }

  private pump() {
    while (this.active < this.maxConcurrent && this.queue.length) {
      const next = this.queue.pop()!;
      if (next.tile.state === 'loading' || next.tile.state === 'ready') continue;
      this.active++;
      void next.layer.load(next.tile, () => {
        this.active--;
        this.onLoaded();
        this.pump();
      });
    }
  }
}

export type { Tile };

export function cameraFrustum(camera: PerspectiveCamera, target = new Frustum()): Frustum {
  const matrix = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  return target.setFromProjectionMatrix(matrix);
}
