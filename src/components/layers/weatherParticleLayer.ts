import { ColumnLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';

export type WeatherKind = 'cloud' | 'rain' | 'storm' | 'snow' | 'wind';

export type WeatherParticle = {
  id: string;
  kind: WeatherKind;
  longitude: number;
  latitude: number;
  altitude: number;
  topAltitude: number;
  intensity: number;
  radiusMeters: number;
  path?: [number, number, number][];
};

type WeatherSystem = {
  id: string;
  lon: number;
  lat: number;
  kind: 'cyclone' | 'front' | 'itcz' | 'jet' | 'convective';
  heading: number;
  width: number;
  length: number;
  intensity: number;
};

const SYSTEMS: WeatherSystem[] = [
  { id: 'npac-low', lon: 154, lat: 39, kind: 'cyclone', heading: 42, width: 13, length: 26, intensity: 0.92 },
  { id: 'atlantic-front', lon: -38, lat: 47, kind: 'front', heading: 62, width: 9, length: 58, intensity: 0.7 },
  { id: 'itcz', lon: -22, lat: 5, kind: 'itcz', heading: 96, width: 8, length: 96, intensity: 0.78 },
  { id: 'bay-convection', lon: 91, lat: 15, kind: 'convective', heading: 18, width: 11, length: 20, intensity: 0.86 },
  { id: 'southern-ocean', lon: 78, lat: -48, kind: 'front', heading: 84, width: 10, length: 74, intensity: 0.64 },
  { id: 'namerica-jet', lon: -102, lat: 42, kind: 'jet', heading: 74, width: 7, length: 72, intensity: 0.58 },
];

export function createWeatherParticles(count: number, seed = 1): WeatherParticle[] {
  const particles: WeatherParticle[] = [];
  let x = seed;
  const random = () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };

  const cloudCount = Math.round(count * 0.58);
  const rainCount = Math.round(count * 0.27);
  const windCount = Math.max(80, Math.round(count * 0.015));
  const stormCount = Math.max(120, count - cloudCount - rainCount - windCount);

  for (let i = 0; i < cloudCount; i++) {
    const system = pickSystem(random, ['front', 'itcz', 'cyclone', 'convective']);
    const p = pointInSystem(system, random);
    const intensity = clamp01(system.intensity * (0.42 + random() * 0.58));
    particles.push({
      id: `cloud-${i}`,
      kind: system.lat < -38 && random() > 0.45 ? 'snow' : 'cloud',
      longitude: p.lon,
      latitude: p.lat,
      altitude: 2300 + random() * 7600,
      topAltitude: 7800 + random() * 5200,
      intensity,
      radiusMeters: (18_000 + random() * 42_000) * (0.65 + intensity),
    });
  }

  for (let i = 0; i < rainCount; i++) {
    const system = pickSystem(random, ['front', 'itcz', 'cyclone', 'convective']);
    const p = pointInSystem(system, random);
    const intensity = clamp01(system.intensity * (0.5 + random() * 0.62));
    particles.push({
      id: `rain-${i}`,
      kind: system.lat < -42 && random() > 0.35 ? 'snow' : 'rain',
      longitude: p.lon,
      latitude: p.lat,
      altitude: 0,
      topAltitude: 2500 + intensity * 5600,
      intensity,
      radiusMeters: 7500 + intensity * 16_000,
    });
  }

  for (let i = 0; i < stormCount; i++) {
    const system = pickSystem(random, ['cyclone', 'itcz', 'convective']);
    const p = pointInSystem(system, random, 0.42);
    const intensity = clamp01(0.55 + system.intensity * random());
    particles.push({
      id: `storm-${i}`,
      kind: 'storm',
      longitude: p.lon,
      latitude: p.lat,
      altitude: 0,
      topAltitude: 6800 + intensity * 9300,
      intensity,
      radiusMeters: 4200 + intensity * 8200,
    });
  }

  for (let i = 0; i < windCount; i++) {
    const system = pickSystem(random, ['jet', 'front']);
    const p = pointInSystem(system, random, 0.7);
    const path = createWindPath(system, p.lon, p.lat, random);
    particles.push({
      id: `wind-${i}`,
      kind: 'wind',
      longitude: p.lon,
      latitude: p.lat,
      altitude: path[0][2],
      topAltitude: path[path.length - 1][2],
      intensity: clamp01(system.intensity * (0.55 + random() * 0.55)),
      radiusMeters: 0,
      path,
    });
  }

  return particles;
}

export function createWeatherParticleLayer(particles: WeatherParticle[]) {
  const clouds = particles.filter((p) => p.kind === 'cloud' || p.kind === 'snow');
  const rain = particles.filter((p) => p.kind === 'rain' || p.kind === 'snow');
  const storm = particles.filter((p) => p.kind === 'storm');
  const wind = particles.filter((p) => p.kind === 'wind' && p.path);

  return [
    new ScatterplotLayer<WeatherParticle>({
      id: 'weather-cloud-volume',
      data: clouds,
      getPosition: (d) => [d.longitude, d.latitude, d.altitude],
      getRadius: (d) => d.radiusMeters,
      radiusMinPixels: 1,
      radiusMaxPixels: 18,
      getFillColor: (d) => {
        if (d.kind === 'snow') return [210, 235, 255, Math.round(72 * d.intensity)];
        return [160, 200, 240, Math.round(60 * d.intensity)];
      },
      pickable: false,
    }),
    new ColumnLayer<WeatherParticle>({
      id: 'weather-rain-columns',
      data: rain,
      diskResolution: 10,
      radius: 6200,
      extruded: true,
      elevationScale: 1,
      getPosition: (d) => [d.longitude, d.latitude, 0],
      getElevation: (d) => d.topAltitude,
      getFillColor: (d) => d.kind === 'snow'
        ? [165, 220, 255, Math.round(82 * d.intensity)]
        : [65, 155, 255, Math.round(95 * d.intensity)],
      getLineColor: [180, 230, 255, 30],
      lineWidthMinPixels: 0.4,
      pickable: false,
    }),
    new ColumnLayer<WeatherParticle>({
      id: 'weather-convective-towers',
      data: storm,
      diskResolution: 12,
      radius: 8200,
      extruded: true,
      elevationScale: 1,
      getPosition: (d) => [d.longitude, d.latitude, 0],
      getElevation: (d) => d.topAltitude,
      getFillColor: (d) => [255, 92, 76, Math.round(112 * d.intensity)],
      getLineColor: [255, 210, 150, 80],
      lineWidthMinPixels: 0.8,
      pickable: false,
    }),
    new PathLayer<WeatherParticle>({
      id: 'weather-upper-winds',
      data: wind,
      getPath: (d) => d.path ?? [],
      getColor: (d) => [115, 220, 255, Math.round(95 * d.intensity)],
      getWidth: 1.4,
      widthUnits: 'pixels',
      widthMinPixels: 1,
      widthMaxPixels: 3,
      capRounded: true,
      jointRounded: true,
      pickable: false,
    }),
  ];
}

function pickSystem(
  random: () => number,
  allowedKinds: WeatherSystem['kind'][],
): WeatherSystem {
  const candidates = SYSTEMS.filter((system) => allowedKinds.includes(system.kind));
  return candidates[Math.floor(random() * candidates.length)] ?? SYSTEMS[0];
}

function pointInSystem(
  system: WeatherSystem,
  random: () => number,
  tightness = 1,
): { lon: number; lat: number } {
  if (system.kind === 'cyclone') {
    const angle = random() * Math.PI * 2;
    const arm = 0.25 + random() * 0.75;
    const radius = system.width * tightness * arm;
    const swirl = angle + arm * 5.2;
    return {
      lon: wrapLon(system.lon + Math.cos(swirl) * radius * 1.4),
      lat: clampLat(system.lat + Math.sin(swirl) * radius),
    };
  }

  const along = (random() - 0.5) * system.length * tightness;
  const across = gaussian(random) * system.width * tightness;
  const theta = (system.heading * Math.PI) / 180;

  return {
    lon: wrapLon(system.lon + Math.cos(theta) * along - Math.sin(theta) * across),
    lat: clampLat(system.lat + Math.sin(theta) * along + Math.cos(theta) * across),
  };
}

function createWindPath(
  system: WeatherSystem,
  lon: number,
  lat: number,
  random: () => number,
): [number, number, number][] {
  const theta = ((system.heading + gaussian(random) * 9) * Math.PI) / 180;
  const length = 7 + random() * 12;
  const altitude = system.kind === 'jet' ? 9000 + random() * 2900 : 5200 + random() * 3800;
  const points: [number, number, number][] = [];

  for (let i = 0; i < 5; i++) {
    const t = (i / 4 - 0.5) * length;
    const wave = Math.sin(i * 1.3 + random() * 2) * 0.8;
    points.push([
      wrapLon(lon + Math.cos(theta) * t - Math.sin(theta) * wave),
      clampLat(lat + Math.sin(theta) * t + Math.cos(theta) * wave),
      altitude + i * 120,
    ]);
  }

  return points;
}

function gaussian(random: () => number): number {
  const u = Math.max(0.0001, random());
  const v = Math.max(0.0001, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampLat(value: number): number {
  return Math.max(-82, Math.min(82, value));
}

function wrapLon(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}
