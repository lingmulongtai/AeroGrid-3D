import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  PerspectiveCamera,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  type IUniform,
  type WebGLRenderer,
} from 'three';
import { EARTH_RADIUS_KM, MERCATOR_MAX_LATITUDE, lonLatToVector } from './geo';
import { SURFACE_FRAGMENT, TILE_VERTEX } from './shaders';
import { cameraFrustum, TileLayer, TileScheduler, type TileSource } from './tiles';
import { GeographicOutlines } from './layers/geographicOutlines';

export type MapStyle = 'dark' | 'satellite' | 'night';

const linear = (hex: string) => new Color(hex).convertSRGBToLinear();

const SOURCES = {
  sentinel: {
    id: 'eox-s2cloudless',
    scheme: 'geographic',
    url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025/default/WGS84/${z}/${y}/${x}.jpg`,
    minZoom: 0,
    maxZoom: 14,
    tileSize: 256,
  },
  esriImagery: {
    id: 'esri-world-imagery',
    scheme: 'mercator',
    url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    minZoom: 9,
    maxZoom: 19,
    tileSize: 256,
    liftKm: 0.006,
    latitudeLimit: 78,
    rejectPlaceholders: true,
  },
  darkCanvas: {
    id: 'esri-dark-gray',
    scheme: 'mercator',
    url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`,
    minZoom: 0,
    maxZoom: 16,
    tileSize: 256,
  },
  blackMarble: {
    id: 'nasa-black-marble',
    scheme: 'mercator',
    url: (z, x, y) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/${z}/${y}/${x}.png`,
    minZoom: 0,
    maxZoom: 8,
    tileSize: 256,
  },
} satisfies Record<string, TileSource>;

interface StyleDefinition {
  sources: TileSource[];
  recolor: number;
  lighting: number;
  nightAmbient: number;
  cityLights: number;
  specular: number;
  brightness: number;
  baseTexture: 'day' | 'night' | null;
  baseColor: string;
  northCap: string | null;
  southCap: string | null;
}

const OCEAN = '#0b2445';
const LAND = '#1c2530';

export const STYLES: Record<MapStyle, StyleDefinition> = {
  satellite: {
    sources: [SOURCES.sentinel, SOURCES.esriImagery],
    recolor: 0,
    lighting: 1,
    nightAmbient: 0.03,
    cityLights: 1,
    specular: 1,
    brightness: 1.0,
    baseTexture: 'day',
    baseColor: '#0d2a4a',
    northCap: null,
    southCap: null,
  },
  dark: {
    sources: [SOURCES.darkCanvas],
    recolor: 1,
    lighting: 0.4,
    nightAmbient: 0.62,
    cityLights: 0.7,
    specular: 0,
    brightness: 1,
    baseTexture: null,
    baseColor: OCEAN,
    northCap: OCEAN,
    southCap: LAND,
  },
  night: {
    sources: [SOURCES.blackMarble],
    recolor: 0,
    lighting: 0,
    nightAmbient: 1,
    cityLights: 0,
    specular: 0,
    brightness: 1.25,
    baseTexture: 'night',
    baseColor: '#020409',
    northCap: '#03060c',
    southCap: '#05080f',
  },
};

export const ATTRIBUTION: Record<MapStyle, string> = {
  satellite: 'Sentinel-2 cloudless © EOX (CC BY-NC-SA 4.0) · Esri World Imagery · Natural Earth',
  dark: 'Esri World Dark Gray Base',
  night: 'NASA GIBS VIIRS Black Marble · Natural Earth',
};

function polarCapGeometry(north: boolean): BufferGeometry {
  const segments = 128;
  const rings = 8;
  const positions: number[] = [];
  const indices: number[] = [];
  const edge = MERCATOR_MAX_LATITUDE - 0.02;
  for (let r = 0; r <= rings; r++) {
    const lat = (north ? 1 : -1) * (edge + ((90 - edge) * r) / rings);
    for (let s = 0; s <= segments; s++) {
      const lon = -180 + (360 * s) / segments;
      const v = lonLatToVector(lon, lat, 0);
      positions.push(v.x, v.y, v.z);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * (segments + 1) + s;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      if (north) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geometry.setIndex(indices);
  return geometry;
}

export interface EarthQuality {
  detail: number;
  maxTiles: number;
  anisotropy: number;
  concurrency: number;
}

export class Earth {
  readonly group = new Group();
  readonly uniforms: Record<string, IUniform>;
  private layers: TileLayer[] = [];
  private base: Mesh;
  private caps: Mesh[] = [];
  private scheduler: TileScheduler;
  private textures: Record<'day' | 'night', Texture>;
  private style: MapStyle | null = null;
  private realisticLighting = true;
  private outlines: GeographicOutlines;
  private frustum = cameraFrustum(new PerspectiveCamera());

  constructor(private renderer: WebGLRenderer, private quality: EarthQuality, private offline: boolean, onTileLoaded: () => void) {
    const loader = new TextureLoader();
    const load = (url: string) => {
      const texture = loader.load(url);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = quality.anisotropy;
      return texture;
    };
    this.textures = { day: load('/textures/earth-day.jpg'), night: load('/textures/earth-night.jpg') };
    this.uniforms = {
      sunDirection: { value: new Vector3(1, 0, 0) },
      nightMap: { value: this.textures.night },
      lighting: { value: 1 },
      nightAmbient: { value: 0.03 },
      cityLights: { value: 1 },
      specularStrength: { value: 1 },
      recolor: { value: 0 },
      brightness: { value: 1 },
      oceanColor: { value: linear(OCEAN) },
      landColor: { value: linear(LAND) },
      lineColor: { value: linear('#5d7896') },
    };
    this.scheduler = new TileScheduler(quality.concurrency);
    this.scheduler.onLoaded = onTileLoaded;

    this.base = new Mesh(new SphereGeometry(EARTH_RADIUS_KM - 2.5, 256, 128), this.createMaterial(null, '#0d2a4a'));
    // SphereGeometry puts u=0.5 at +X; equirectangular imagery has 0° there.
    this.base.rotation.y = -Math.PI / 2;
    this.base.renderOrder = -5;
    this.base.name = 'earth-base';
    this.group.add(this.base);
    this.outlines = new GeographicOutlines(this.uniforms.sunDirection, this.uniforms.lighting);
    this.group.add(this.outlines.group);
  }

  private createMaterial(map: Texture | null, color: string) {
    return new ShaderMaterial({
      vertexShader: TILE_VERTEX,
      fragmentShader: SURFACE_FRAGMENT,
      uniforms: {
        ...this.uniforms,
        map: { value: map },
        hasMap: { value: map ? 1 : 0 },
        flatColor: { value: linear(color) },
      },
    });
  }

  setQuality(quality: EarthQuality) {
    this.quality = quality;
    this.scheduler.maxConcurrent = quality.concurrency;
  }

  setStyle(style: MapStyle) {
    if (style === this.style) return;
    this.style = style;
    this.outlines.group.visible = style !== 'dark';
    const definition = STYLES[style];
    for (const layer of this.layers) layer.dispose();
    this.layers = [];
    for (const cap of this.caps) {
      cap.removeFromParent();
      cap.geometry.dispose();
      (cap.material as ShaderMaterial).dispose();
    }
    this.caps = [];

    const baseMaterial = this.base.material as ShaderMaterial;
    const baseTexture = definition.baseTexture ? this.textures[definition.baseTexture] : null;
    baseMaterial.uniforms.map.value = baseTexture;
    baseMaterial.uniforms.hasMap.value = baseTexture ? 1 : 0;
    baseMaterial.uniforms.flatColor.value = linear(definition.baseColor);

    this.uniforms.recolor.value = definition.recolor;
    this.uniforms.nightAmbient.value = definition.nightAmbient;
    this.uniforms.cityLights.value = definition.cityLights;
    this.uniforms.specularStrength.value = definition.specular;
    this.uniforms.brightness.value = definition.brightness;
    this.applyLighting();

    for (const [north, color] of [[true, definition.northCap], [false, definition.southCap]] as const) {
      if (!color) continue;
      const cap = new Mesh(polarCapGeometry(north), this.createMaterial(null, color));
      cap.renderOrder = -4;
      this.caps.push(cap);
      this.group.add(cap);
    }

    if (this.offline) return;
    definition.sources.forEach((source, index) => {
      const layer = new TileLayer(source, {
        renderer: this.renderer,
        sharedUniforms: this.uniforms,
        materialUniforms: { flatColor: { value: new Color() } },
        renderOrder: -3 + index,
        anisotropy: this.quality.anisotropy,
      });
      this.layers.push(layer);
      this.group.add(layer.group);
    });
  }

  setRealisticLighting(enabled: boolean) {
    this.realisticLighting = enabled;
    this.applyLighting();
  }

  private applyLighting() {
    const definition = this.style ? STYLES[this.style] : STYLES.satellite;
    this.uniforms.lighting.value = this.realisticLighting ? definition.lighting : 0;
  }

  setSunDirection(direction: Vector3) {
    (this.uniforms.sunDirection.value as Vector3).copy(direction);
  }

  debugTiles() {
    return { active: this.scheduler.active, max: this.scheduler.maxConcurrent, layers: this.layers.map((layer) => layer.debug()) };
  }

  get tileCount() {
    return this.layers.reduce((sum, layer) => sum + layer.loadedCount, 0);
  }

  update(camera: PerspectiveCamera, frame: number, viewportHeight: number) {
    this.outlines.update(camera.position.length() - EARTH_RADIUS_KM);
    if (!this.layers.length) return;
    cameraFrustum(camera, this.frustum);
    const cameraPosition = camera.position;
    const distance = cameraPosition.length();
    const horizonAngle = Math.acos(Math.min(1, EARTH_RADIUS_KM / Math.max(distance, EARTH_RADIUS_KM + 0.001)));
    const pixelsPerRadian = viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const requests = this.layers.map((layer) => ({
      layer,
      tiles: layer.update({
        camera,
        frustum: this.frustum,
        cameraPosition,
        horizonAngle,
        pixelsPerRadian,
        detail: this.quality.detail,
        frame,
      }),
    }));
    this.scheduler.schedule(requests);
    if (frame % 30 === 0) {
      for (const layer of this.layers) layer.evict(this.quality.maxTiles, frame);
    }
  }

  dispose() {
    this.outlines.dispose();
    for (const layer of this.layers) layer.dispose();
    this.base.geometry.dispose();
    (this.base.material as ShaderMaterial).dispose();
    for (const cap of this.caps) cap.geometry.dispose();
    this.textures.day.dispose();
    this.textures.night.dispose();
  }
}
