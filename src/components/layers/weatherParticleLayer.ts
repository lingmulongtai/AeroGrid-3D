import { ScatterplotLayer } from '@deck.gl/layers';

export type WeatherParticle = {
  id: string;
  longitude: number;
  latitude: number;
  altitude: number;
  intensity: number;
  phase: 'front' | 'storm' | 'jet';
};

type WeatherSystem = {
  lon: number;
  lat: number;
  radius: number;
  strength: number;
  phase: WeatherParticle['phase'];
};

const SYSTEMS: WeatherSystem[] = [
  { lon: 143, lat: 31, radius: 18, strength: 0.92, phase: 'storm' },
  { lon: -74, lat: 38, radius: 20, strength: 0.82, phase: 'front' },
  { lon: -4, lat: 51, radius: 16, strength: 0.74, phase: 'front' },
  { lon: 89, lat: 18, radius: 22, strength: 0.86, phase: 'storm' },
  { lon: -58, lat: -31, radius: 18, strength: 0.7, phase: 'front' },
  { lon: 26, lat: -28, radius: 16, strength: 0.64, phase: 'storm' },
];

function seededRandom(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function wrapLon(lon: number): number {
  return ((lon + 540) % 360) - 180;
}

function jetLatitude(lon: number, hemisphere: 1 | -1): number {
  return hemisphere * (36 + 8 * Math.sin((lon + 35) * Math.PI / 55) + 3 * Math.sin(lon * Math.PI / 21));
}

export function createWeatherParticles(count: number, seed = 1): WeatherParticle[] {
  const particles: WeatherParticle[] = [];
  const random = seededRandom(seed);
  const stormCount = Math.floor(count * 0.48);
  const frontCount = Math.floor(count * 0.34);

  for (let i = 0; i < stormCount; i++) {
    const system = SYSTEMS[Math.floor(random() * SYSTEMS.length)];
    const theta = random() * Math.PI * 2;
    const spiral = system.radius * Math.sqrt(random());
    const curl = theta + spiral * 0.13 * (system.lat >= 0 ? 1 : -1);
    particles.push({
      id: `storm-${i}`,
      longitude: wrapLon(system.lon + Math.cos(curl) * spiral * 1.45),
      latitude: Math.max(-78, Math.min(78, system.lat + Math.sin(curl) * spiral)),
      altitude: 1400 + random() * 7600,
      intensity: Math.min(1, system.strength * (0.45 + random() * 0.65)),
      phase: system.phase,
    });
  }

  for (let i = 0; i < frontCount; i++) {
    const lon = -180 + random() * 360;
    const hemisphere = random() > 0.42 ? 1 : -1;
    const lat = jetLatitude(lon, hemisphere) + (random() - 0.5) * 9;
    particles.push({
      id: `front-${i}`,
      longitude: wrapLon(lon + (random() - 0.5) * 8),
      latitude: Math.max(-72, Math.min(72, lat)),
      altitude: 5200 + random() * 6200,
      intensity: 0.35 + random() * 0.45,
      phase: 'front',
    });
  }

  for (let i = stormCount + frontCount; i < count; i++) {
    const lon = -180 + random() * 360;
    const hemisphere = random() > 0.5 ? 1 : -1;
    particles.push({
      id: `jet-${i}`,
      longitude: lon,
      latitude: jetLatitude(lon, hemisphere) + (random() - 0.5) * 5,
      altitude: 8200 + random() * 3600,
      intensity: 0.18 + random() * 0.35,
      phase: 'jet',
    });
  }

  return particles;
}

export function createWeatherParticleLayer(particles: WeatherParticle[]) {
  return new ScatterplotLayer<WeatherParticle>({
    id: 'weather-particles',
    data: particles,
    getPosition: (d) => [d.longitude, d.latitude, d.altitude],
    getRadius: (d) => d.phase === 'storm' ? 13000 * d.intensity : d.phase === 'front' ? 9000 * d.intensity : 5200 * d.intensity,
    radiusMinPixels: 1,
    radiusMaxPixels: 10,
    getFillColor: (d) => {
      if (d.phase === 'storm') return [75, 170, 255, Math.round(155 * d.intensity)];
      if (d.phase === 'front') return [150, 205, 255, Math.round(120 * d.intensity)];
      return [210, 235, 255, Math.round(72 * d.intensity)];
    },
    pickable: false,
  });
}
