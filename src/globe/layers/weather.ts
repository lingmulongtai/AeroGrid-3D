import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LineSegments,
  Matrix4,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  Vector2,
  type PerspectiveCamera,
  type IUniform,
} from 'three';
import { DEG, EARTH_RADIUS_KM, enuFrame, lonLatToVector, wrapLongitude } from '../geo';
import { cloudHalfHeight } from './cloudVolume';
import type { CloudProfile } from '../../../shared/live';

interface CloudParticle {
  position: Vector3;
  size: number;
  halfHeight?: number;
  opacity: number;
  shade: number;
  swirlAxis: Vector3;
  swirlRate: number;
  lightning: number;
  seed: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createPuffTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const random = mulberry32(7);
  context.clearRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * size * 0.22;
    const x = size / 2 + Math.cos(angle) * distance;
    const y = size / 2 + Math.sin(angle) * distance;
    const radius = size * (0.12 + random() * 0.2);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    const alpha = 0.16 + random() * 0.22;
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.45})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const CLOUD_VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float size;
attribute float opacity;
attribute float shade;
attribute vec4 swirl;
attribute vec3 cloudCenter;
attribute float halfHeight;
attribute float seed;
uniform float time;
uniform float pixelsPerRadian;
uniform vec3 sunDirection;
uniform float nightStyle;
uniform vec3 cameraWorld;
varying float vAlpha;
varying vec3 vColor;
varying float vRotation;
varying vec3 vCenter;
varying vec3 vNormal;
varying vec2 vRadii;

vec3 rotateAround(vec3 p, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return p * c + cross(axis, p) * s + axis * dot(axis, p) * (1.0 - c);
}

void main() {
  vec3 p = cloudCenter;
  if (swirl.w != 0.0) p = rotateAround(p, swirl.xyz, swirl.w * time);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float distance = max(-mvPosition.z, 0.001);
  float pixels = size / distance * pixelsPerRadian;
  vCenter = p;
  vNormal = normalize(p);
  vRadii = vec2(size * 0.5, halfHeight);
  // Conservative screen bounds; fragments ray-test the physical volume.
  float radius = size * 0.5;
  float cameraRadius = length(cameraWorld);
  float centerRadius = length(p);
  float horizon = acos(clamp(6371.0 / cameraRadius, 0.0, 1.0))
    + acos(clamp(6371.0 / (centerRadius + halfHeight), 0.0, 1.0))
    + asin(clamp(radius / centerRadius, 0.0, 1.0));
  if (mvPosition.z > radius || dot(normalize(cameraWorld), vNormal) < cos(horizon)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0; vColor = vec3(0.0); vRotation = 0.0;
    return;
  }
  if (-mvPosition.z <= radius) {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  } else {
    vec3 viewNormal = mat3(viewMatrix) * vNormal;
    vec2 extent = sqrt(vec2(radius * radius) * (1.0 - viewNormal.xy * viewNormal.xy)
      + halfHeight * halfHeight * viewNormal.xy * viewNormal.xy);
    vec4 clip = projectionMatrix * mvPosition;
    vec2 scale = vec2(projectionMatrix[0][0], projectionMatrix[1][1]);
    float nearDepth = max(0.001, -mvPosition.z - radius);
    // Off-centre volumes also shift in perspective as their depth changes.
    vec2 screenExtent = extent * scale * clip.w / nearDepth + abs(clip.xy) * radius / nearDepth;
    clip.xy += position.xy * screenExtent;
    gl_Position = clip;
  }

  vec3 normal = normalize(p);
  float sunDot = dot(normal, sunDirection);
  float light = smoothstep(-0.16, 0.2, sunDot);
  vec3 day = mix(vec3(1.0), vec3(0.42, 0.45, 0.5), shade);
  vec3 sunset = vec3(1.0, 0.62, 0.38) * (1.0 - shade * 0.5);
  float twilight = smoothstep(-0.12, 0.02, sunDot) * (1.0 - smoothstep(0.02, 0.22, sunDot));
  vec3 night = vec3(0.025, 0.032, 0.05);
  vColor = mix(night, mix(day, sunset, twilight * 0.85), light * (1.0 - nightStyle * 0.88));
  float tinyFade = smoothstep(0.6, 2.2, pixels);
  vAlpha = opacity * tinyFade;
  vRotation = seed * 6.2831;
  #include <logdepthbuf_vertex>
}
`;

const CLOUD_FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D puff;
uniform float globalOpacity;
uniform vec3 cameraWorld;
uniform vec2 viewport;
uniform mat4 inverseProjection;
uniform mat4 cameraMatrix;
varying float vAlpha;
varying vec3 vColor;
varying float vRotation;
varying vec3 vCenter;
varying vec3 vNormal;
varying vec2 vRadii;
float metric(vec3 a, vec3 b) {
  float h2 = vRadii.x * vRadii.x;
  float v2 = vRadii.y * vRadii.y;
  return dot(a, b) / h2 + (1.0 / v2 - 1.0 / h2) * dot(a, vNormal) * dot(b, vNormal);
}
void main() {
  vec2 ndc = gl_FragCoord.xy / viewport * 2.0 - 1.0;
  vec4 view = inverseProjection * vec4(ndc, 1.0, 1.0);
  vec3 ray = normalize(mat3(cameraMatrix) * view.xyz);
  vec3 offset = cameraWorld - vCenter;
  float a = metric(ray, ray);
  float closestTime = -metric(offset, ray) / a;
  vec3 closest = offset + ray * closestTime;
  float remaining = 1.0 - metric(closest, closest);
  if (remaining <= 0.0) discard;
  float span = sqrt(remaining / a);
  float enter = max(0.001, closestTime - span);
  float exit = closestTime + span;
  if (exit <= enter) discard;
  vec3 hit = cameraWorld + ray * enter;
  float clipW = -(viewMatrix * vec4(hit, 1.0)).z;
  if (clipW <= 0.0) discard;
  gl_FragDepth = log2(1.0 + clipW) * logDepthBufFC * 0.5;
  vec3 east = normalize(cross(abs(vNormal.y) > 0.99 ? vec3(1,0,0) : vec3(0,1,0), vNormal));
  vec3 north = cross(vNormal, east);
  vec3 local = hit - vCenter;
  vec2 uv = vec2(dot(local, east), dot(local, north)) / vRadii.x * 0.5;
  float c = cos(vRotation);
  float s = sin(vRotation);
  uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) + 0.5;
  float density = texture2D(puff, uv).a;
  float chord = min(1.0, (exit - enter) / (vRadii.y * 2.0));
  float alpha = density * vAlpha * globalOpacity * smoothstep(0.0, 0.3, chord);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(vColor, min(1.0, alpha * 1.6));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const RAIN_VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float phase;
attribute float tip;
attribute float fallHeight;
uniform float time;
uniform vec3 cameraWorld;
varying float vAlpha;
void main() {
  vec3 dir = normalize(position);
  float base = length(position);
  float drop = mod(phase * fallHeight + time * 1.8, fallHeight);
  float height = base - drop + tip * 0.9;
  vec3 world = dir * height;
  vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float distance = length(cameraWorld - world);
  vAlpha = (1.0 - smoothstep(60.0, 900.0, distance)) * (0.35 + 0.65 * tip) * smoothstep(0.0, 0.6, drop);
  #include <logdepthbuf_vertex>
}
`;

const RAIN_FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float globalOpacity;
varying float vAlpha;
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(vec3(0.55, 0.68, 0.9) * vAlpha * globalOpacity * 0.85, 1.0);
}
`;

type Emit = (particle: Omit<CloudParticle, 'position' | 'swirlAxis'> & { lon: number; lat: number; alt: number; swirlAxis?: Vector3 }) => void;

function offsetLonLat(lon: number, lat: number, eastKm: number, northKm: number): [number, number] {
  const newLat = Math.max(-89.5, Math.min(89.5, lat + northKm / (EARTH_RADIUS_KM * DEG)));
  const newLon = wrapLongitude(lon + eastKm / (EARTH_RADIUS_KM * DEG * Math.max(0.05, Math.cos(lat * DEG))));
  return [newLon, newLat];
}

function generateDemoWeather(budget: number, seed: number): CloudParticle[] {
  const random = mulberry32(seed);
  const particles: CloudParticle[] = [];
  const emit: Emit = (p) => {
    particles.push({
      ...p,
      position: lonLatToVector(p.lon, p.lat, p.alt),
      swirlAxis: p.swirlAxis ?? new Vector3(0, 1, 0),
    });
  };
  const gauss = () => (random() + random() + random() - 1.5) / 1.5;

  // Tropical cyclones with an eye, eyewall and spiral rain bands.
  const cyclones: Array<[number, number]> = [[134, 19], [-66, 23], [88, 15], [61, -17], [158, -16]];
  const cycloneShare = Math.floor(budget * 0.22);
  cyclones.forEach(([lon, lat], index) => {
    const axis = lonLatToVector(lon, lat, 0).normalize();
    const hemisphere = lat >= 0 ? 1 : -1;
    const radius = 650 + random() * 350;
    const count = Math.floor(cycloneShare / cyclones.length);
    const rate = 0.012 * hemisphere * (0.8 + random() * 0.4);
    for (let i = 0; i < count; i++) {
      const eyewall = i < count * 0.18;
      const t = eyewall ? random() * 0.08 : Math.pow(random(), 0.8);
      const r = eyewall ? 28 + random() * 40 : 55 + t * radius;
      const arm = Math.floor(random() * 3);
      const angle = arm * (Math.PI * 2 / 3) + hemisphere * t * 4.2 + gauss() * (eyewall ? Math.PI : 0.55 + t * 0.5);
      const [plon, plat] = offsetLonLat(lon, lat, Math.cos(angle) * r, Math.sin(angle) * r);
      emit({
        lon: plon, lat: plat, alt: 6 + random() * 7,
        size: (eyewall ? 70 : 110 + random() * 120) * (1 - t * 0.3),
        opacity: eyewall ? 0.75 : 0.32 + random() * 0.3 - t * 0.18,
        shade: eyewall ? 0.75 : Math.max(0, 0.6 - t * 0.9) * random(),
        swirlAxis: axis,
        swirlRate: rate,
        lightning: eyewall && random() > 0.85 ? 1 : 0,
        seed: random() + index,
      });
    }
  });

  // Mid-latitude comma clouds along cold fronts.
  const fronts = 12;
  const frontShare = Math.floor(budget * 0.32);
  for (let f = 0; f < fronts; f++) {
    const southern = f % 3 === 0;
    const lat = (southern ? -1 : 1) * (40 + random() * 16);
    const lon = -180 + (360 / fronts) * f + random() * 20;
    const length = 1800 + random() * 1700;
    const count = Math.floor(frontShare / fronts);
    const sweep = (southern ? -1 : 1);
    for (let i = 0; i < count; i++) {
      const head = i < count * 0.3;
      let east: number;
      let north: number;
      if (head) {
        const angle = random() * Math.PI * 1.6 + 0.4;
        const r = 120 + random() * 520;
        east = Math.cos(angle) * r;
        north = Math.sin(angle) * r * sweep;
      } else {
        const t = random();
        east = -150 + t * 520 + gauss() * (260 + t * 180);
        north = -sweep * t * length + gauss() * 220;
        east += Math.sin(t * 2.6) * 420;
      }
      const [plon, plat] = offsetLonLat(lon, lat, east, north);
      const core = Math.max(0, 1 - Math.abs(gauss()) * 1.5);
      emit({
        lon: plon, lat: plat, alt: 2.5 + random() * 6.5,
        size: 110 + random() * 150,
        opacity: 0.18 + random() * 0.3,
        shade: core * 0.65,
        swirlRate: 0,
        lightning: 0,
        seed: random() * 10,
      });
    }
  }

  // ITCZ thunderstorm clusters.
  const clusters = 34;
  const itczShare = Math.floor(budget * 0.2);
  for (let c = 0; c < clusters; c++) {
    const lon = -180 + (360 / clusters) * c + random() * 8;
    const lat = 5 + Math.sin(lon * DEG * 2) * 4 + gauss() * 4;
    const count = Math.floor(itczShare / clusters);
    const radius = 120 + random() * 220;
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * radius;
      const [plon, plat] = offsetLonLat(lon, lat, Math.cos(angle) * r, Math.sin(angle) * r);
      const tower = random() > 0.6;
      emit({
        lon: plon, lat: plat, alt: tower ? 9 + random() * 6 : 3 + random() * 5,
        size: tower ? 70 + random() * 70 : 45 + random() * 55,
        opacity: 0.35 + random() * 0.35,
        shade: tower ? 0.55 + random() * 0.35 : 0.2,
        swirlRate: 0,
        lightning: tower && random() > 0.8 ? 1 : 0,
        seed: random() * 10,
      });
    }
  }

  // Marine stratocumulus decks off the subtropical west coasts.
  const decks: Array<[number, number, number, number]> = [[-127, 30, 1400, 900], [-86, -18, 1500, 1100], [4, -20, 1300, 900], [-22, 25, 900, 700]];
  const deckShare = Math.floor(budget * 0.14);
  for (const [lon, lat, width, height] of decks) {
    const count = Math.floor(deckShare / decks.length);
    for (let i = 0; i < count; i++) {
      const [plon, plat] = offsetLonLat(lon, lat, (random() - 0.5) * width, (random() - 0.5) * height);
      emit({
        lon: plon, lat: plat, alt: 1.0 + random() * 1.2,
        size: 60 + random() * 70,
        opacity: 0.16 + random() * 0.2,
        shade: 0.05,
        swirlRate: 0,
        lightning: 0,
        seed: random() * 10,
      });
    }
  }

  // Scattered fair-weather cumulus and Southern Ocean streets.
  while (particles.length < budget) {
    const southernOcean = random() > 0.6;
    const lat = southernOcean ? -48 - random() * 16 : Math.asin(random() * 2 - 1) / DEG * 0.85;
    const lon = -180 + random() * 360;
    emit({
      lon, lat, alt: 1.2 + random() * 3,
      size: 30 + random() * (southernOcean ? 110 : 50),
      opacity: 0.12 + random() * 0.22,
      shade: southernOcean ? random() * 0.35 : 0,
      swirlRate: 0,
      lightning: 0,
      seed: random() * 10,
    });
  }
  return particles;
}

async function sampleRadar(urlTemplate: string, center: { latitude: number; longitude: number }, radiusKm: number, budget: number, signal: AbortSignal): Promise<CloudParticle[]> {
  const zoom = 6;
  const n = 2 ** zoom;
  const toTile = (lon: number, lat: number) => {
    const x = ((lon + 180) / 360) * n;
    const latRad = lat * DEG;
    const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
    return [x, y];
  };
  const [westLon, northLat] = offsetLonLat(center.longitude, center.latitude, -radiusKm, radiusKm);
  const [eastLon, southLat] = offsetLonLat(center.longitude, center.latitude, radiusKm, -radiusKm);
  const [x0, y0] = toTile(westLon, northLat);
  const [x1, y1] = toTile(eastLon, southLat);
  const particles: CloudParticle[] = [];
  const random = mulberry32(42);
  const tiles: Array<[number, number]> = [];
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
    for (let y = Math.floor(y0); y <= Math.floor(y1); y++) tiles.push([((x % n) + n) % n, y]);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const stride = 3;
  for (const [x, y] of tiles.slice(0, 16)) {
    const url = urlTemplate.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y));
    const response = await fetch(url, { signal, mode: 'cors' });
    if (!response.ok) continue;
    const bitmap = await createImageBitmap(await response.blob());
    context.clearRect(0, 0, 256, 256);
    context.drawImage(bitmap, 0, 0, 256, 256);
    bitmap.close();
    const { data } = context.getImageData(0, 0, 256, 256);
    for (let py = 0; py < 256; py += stride) {
      for (let px = 0; px < 256; px += stride) {
        const i = (py * 256 + px) * 4;
        const alpha = data[i + 3];
        if (alpha < 40) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const intensity = Math.min(1, (alpha / 255) * (0.35 + Math.max(r, g * 0.8) / 255 * 0.65 + (r > b ? 0.3 : 0)));
        const lon = ((x + (px + random() * stride) / 256) / n) * 360 - 180;
        const merc = Math.PI * (1 - (2 * (y + (py + random() * stride) / 256)) / n);
        const lat = Math.atan(Math.sinh(merc)) / DEG;
        particles.push({
          position: lonLatToVector(lon, lat, 2.5 + intensity * 7 + random() * 2),
          size: 9 + intensity * 16,
          opacity: 0.35 + intensity * 0.55,
          shade: Math.min(0.85, intensity * 0.9),
          swirlAxis: new Vector3(0, 1, 0),
          swirlRate: 0,
          lightning: intensity > 0.85 && random() > 0.92 ? 1 : 0,
          seed: random() * 10,
        });
        if (particles.length >= budget) return particles;
      }
    }
  }
  return particles;
}

export class WeatherLayer {
  readonly group = new Group();
  private clouds: Mesh;
  private rain: LineSegments;
  private cloudMaterial: ShaderMaterial;
  private rainMaterial: ShaderMaterial;
  private source: 'demo' | 'radar' | 'profiles' | 'off' = 'off';
  private profiles: CloudProfile[] = [];
  private radarKey = '';
  private rainRadarKey = '';
  private abort: AbortController | null = null;
  private budget = 12_000;
  readonly uniforms: Record<string, IUniform>;
  visible = true;

  constructor(sunDirection: IUniform<Vector3>) {
    this.uniforms = {
      time: { value: 0 },
      pixelsPerRadian: { value: 1000 },
      viewport: { value: new Vector2(1, 1) },
      inverseProjection: { value: new Matrix4() },
      cameraMatrix: { value: new Matrix4() },
      sunDirection,
      puff: { value: createPuffTexture() },
      globalOpacity: { value: 0.85 },
      cameraWorld: { value: new Vector3() },
      nightStyle: { value: 0 },
    };
    this.cloudMaterial = new ShaderMaterial({
      vertexShader: CLOUD_VERTEX,
      fragmentShader: CLOUD_FRAGMENT,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
    this.rainMaterial = new ShaderMaterial({
      vertexShader: RAIN_VERTEX,
      fragmentShader: RAIN_FRAGMENT,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.clouds = new Mesh(new InstancedBufferGeometry(), this.cloudMaterial);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = 8;
    this.rain = new LineSegments(new BufferGeometry(), this.rainMaterial);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 7;
    this.group.add(this.rain, this.clouds);
  }

  get particleCount() {
    return this.group.visible ? ((this.clouds.geometry as InstancedBufferGeometry).instanceCount || 0) : 0;
  }

  setBudget(budget: number) {
    if (budget === this.budget) return;
    this.budget = budget;
    const source = this.source;
    this.source = 'off';
    this.radarKey = '';
    if (source === 'demo') this.useDemo();
    else if (source === 'profiles') this.useProfiles(this.profiles);
  }

  setNightStyle(enabled: boolean) {
    this.uniforms.nightStyle.value = enabled ? 1 : 0;
  }

  setOpacity(opacity: number) {
    this.uniforms.globalOpacity.value = opacity;
  }

  useDemo() {
    if (this.source === 'demo') return;
    this.abort?.abort();
    this.source = 'demo';
    this.radarKey = '';
    this.apply(generateDemoWeather(this.budget, 20_260_101));
  }

  useRadar(urlTemplate: string, center: { latitude: number; longitude: number }, radiusKm: number, onError: () => void) {
    const key = `${urlTemplate}|${center.latitude.toFixed(2)}|${center.longitude.toFixed(2)}|${radiusKm}`;
    if (this.source === 'radar' && key === this.radarKey) return;
    this.abort?.abort();
    this.source = 'radar';
    this.radarKey = key;
    const controller = new AbortController();
    this.abort = controller;
    sampleRadar(urlTemplate, center, radiusKm, this.budget, controller.signal)
      .then((particles) => {
        if (!controller.signal.aborted) this.apply(particles);
      })
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') onError();
      });
  }

  useProfiles(profiles: CloudProfile[]) {
    if (this.source === 'profiles' && this.profiles === profiles) return;
    if (this.source !== 'profiles') this.abort?.abort();
    this.source = 'profiles'; this.profiles = profiles;
    const random = mulberry32(20261013);
    const particles: CloudParticle[] = [];
    const active = profiles.flatMap((profile) => profile.levels.filter((level) => level.coverPercent >= 10).map((level) => ({ profile, level })));
    const perLevel = Math.max(1, Math.floor(this.budget / Math.max(1, active.length)));
    for (const { profile, level } of active) {
      const size = Math.max(3, profile.footprintKm / 12);
      const count = Math.min(Math.floor(perLevel * level.coverPercent / 100), Math.ceil(2 * (profile.footprintKm / size) ** 2 * level.coverPercent / 100));
      for (let i = 0; i < count; i++) {
        const [lon, lat] = offsetLonLat(profile.longitude, profile.latitude, (random() - 0.5) * profile.footprintKm, (random() - 0.5) * profile.footprintKm);
        // Pressure-level altitude is modelled AMSL; radar intensity never sets height.
        const altitude = level.altitudeKm;
        particles.push({ position: lonLatToVector(lon, lat, altitude), size, halfHeight: Math.max(0.01, Math.min(cloudHalfHeight(altitude, size), altitude - profile.groundAltitudeKm - 0.05)), opacity: 0.25 + level.coverPercent / 250, shade: level.pressureHpa >= 850 ? 0.3 : 0.1, swirlAxis: new Vector3(0, 1, 0), swirlRate: 0, lightning: 0, seed: random() * 10 });
      }
    }
    this.apply(particles, false);
  }

  useRadarRain(urlTemplate: string | null, center: { latitude: number; longitude: number }, radiusKm: number, onError: () => void) {
    if (!urlTemplate) { this.rainRadarKey = ''; this.abort?.abort(); this.applyRain([]); return; }
    const key = `${urlTemplate}|${center.latitude.toFixed(2)}|${center.longitude.toFixed(2)}|${radiusKm}`;
    if (key === this.rainRadarKey) return;
    this.abort?.abort(); this.rainRadarKey = key;
    const controller = new AbortController(); this.abort = controller;
    void sampleRadar(urlTemplate, center, radiusKm, Math.min(2000, this.budget), controller.signal).then((particles) => {
      if (controller.signal.aborted) return;
      // Radar observes precipitation only. Column tops are an illustration using
      // the nearest forecast cloud level (or 2.5 km when no forecast is available).
      for (const particle of particles) {
        const longitude = Math.atan2(particle.position.x, particle.position.z) / DEG;
        const latitude = Math.asin(particle.position.y / particle.position.length()) / DEG;
        const profile = [...this.profiles].sort((a, b) => Math.hypot(a.longitude - longitude, a.latitude - latitude) - Math.hypot(b.longitude - longitude, b.latitude - latitude))[0];
        const altitude = profile?.levels.find((level) => level.coverPercent >= 10)?.altitudeKm ?? 2.5;
        particle.position.copy(lonLatToVector(longitude, latitude, altitude));
      }
      this.applyRain(particles);
    }).catch((error) => { if (!controller.signal.aborted) { this.applyRain([]); onError(); } });
  }

  clear() {
    this.abort?.abort();
    this.source = 'off';
    this.radarKey = '';
    this.rainRadarKey = '';
    this.apply([]);
  }

  private apply(particles: CloudParticle[], includeRain = true) {
    const count = particles.length;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const opacities = new Float32Array(count);
    const shades = new Float32Array(count);
    const swirls = new Float32Array(count * 4);
    const seeds = new Float32Array(count);
    const thicknesses = new Float32Array(count);
    particles.forEach((p, i) => {
      positions.set([p.position.x, p.position.y, p.position.z], i * 3);
      sizes[i] = p.size;
      opacities[i] = p.opacity;
      shades[i] = p.shade;
      swirls.set([p.swirlAxis.x, p.swirlAxis.y, p.swirlAxis.z, p.swirlRate], i * 4);
      seeds[i] = p.seed;
      thicknesses[i] = p.halfHeight ?? cloudHalfHeight(p.position.length() - EARTH_RADIUS_KM, p.size);
    });
    const quad = new PlaneGeometry(2, 2);
    const geometry = new InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('cloudCenter', new InstancedBufferAttribute(positions, 3));
    geometry.setAttribute('size', new InstancedBufferAttribute(sizes, 1));
    geometry.setAttribute('opacity', new InstancedBufferAttribute(opacities, 1));
    geometry.setAttribute('shade', new InstancedBufferAttribute(shades, 1));
    geometry.setAttribute('swirl', new InstancedBufferAttribute(swirls, 4));
    geometry.setAttribute('seed', new InstancedBufferAttribute(seeds, 1));
    geometry.setAttribute('halfHeight', new InstancedBufferAttribute(thicknesses, 1));
    geometry.instanceCount = count;
    this.clouds.geometry.dispose();
    this.clouds.geometry = geometry;
    if (includeRain || particles.length === 0) this.applyRain(particles);
  }

  private applyRain(particles: CloudParticle[]) {
    const random = mulberry32(99);
    const rainSources = particles.filter((p) => p.shade > 0.45 && p.swirlRate === 0);
    const streaksPer = 7;
    const streaks = rainSources.length * streaksPer;
    const rainPositions = new Float32Array(streaks * 2 * 3);
    const phases = new Float32Array(streaks * 2);
    const tips = new Float32Array(streaks * 2);
    const heights = new Float32Array(streaks * 2);
    let v = 0;
    for (const source of rainSources) {
      const center = source.position.clone();
      const { longitude, latitude } = { longitude: Math.atan2(center.x, center.z) / DEG, latitude: Math.asin(center.y / center.length()) / DEG };
      const { east, north } = enuFrame(longitude, latitude);
      const baseAltitude = Math.min(4, center.length() - EARTH_RADIUS_KM);
      for (let s = 0; s < streaksPer; s++) {
        const offset = east.clone().multiplyScalar((random() - 0.5) * source.size * 0.9)
          .addScaledVector(north, (random() - 0.5) * source.size * 0.9);
        const base = center.clone().normalize().multiplyScalar(EARTH_RADIUS_KM + baseAltitude).add(offset);
        const phase = random();
        for (let tip = 0; tip < 2; tip++) {
          rainPositions.set([base.x, base.y, base.z], v * 3);
          phases[v] = phase;
          tips[v] = tip;
          heights[v] = baseAltitude;
          v++;
        }
      }
    }
    const rainGeometry = new BufferGeometry();
    rainGeometry.setAttribute('position', new BufferAttribute(rainPositions, 3));
    rainGeometry.setAttribute('phase', new BufferAttribute(phases, 1));
    rainGeometry.setAttribute('tip', new BufferAttribute(tips, 1));
    rainGeometry.setAttribute('fallHeight', new BufferAttribute(heights, 1));
    this.rain.geometry.dispose();
    this.rain.geometry = rainGeometry;
  }

  update(seconds: number, pixelsPerRadian: number, camera: PerspectiveCamera, viewport: Vector2) {
    const cameraPosition = camera.position;
    this.group.visible = this.visible && this.source !== 'off';
    this.uniforms.time.value = seconds;
    this.uniforms.pixelsPerRadian.value = pixelsPerRadian;
    (this.uniforms.cameraWorld.value as Vector3).copy(cameraPosition);
    (this.uniforms.viewport.value as Vector2).copy(viewport);
    (this.uniforms.inverseProjection.value as Matrix4).copy(camera.projectionMatrixInverse);
    (this.uniforms.cameraMatrix.value as Matrix4).copy(camera.matrixWorld);
    this.rain.visible = cameraPosition.length() - EARTH_RADIUS_KM < 1_500;
  }

  dispose() {
    this.abort?.abort();
    this.clouds.geometry.dispose();
    this.rain.geometry.dispose();
    this.cloudMaterial.dispose();
    this.rainMaterial.dispose();
    (this.uniforms.puff.value as CanvasTexture).dispose();
  }
}
