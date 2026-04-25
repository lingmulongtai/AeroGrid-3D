import { ScatterplotLayer } from '@deck.gl/layers';

export type WeatherParticle = {
  id: string;
  longitude: number;
  latitude: number;
  altitude: number;
  intensity: number;
};

export function createWeatherParticles(count: number, seed = 1): WeatherParticle[] {
  const particles: WeatherParticle[] = [];
  let x = seed;
  const random = () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    const band = random();
    const latBase = band < 0.4 ? 20 : band < 0.7 ? -10 : 45;
    particles.push({
      id: `wp-${i}`,
      longitude: -180 + random() * 360,
      latitude: Math.max(-80, Math.min(80, latBase + (random() - 0.5) * 32)),
      altitude: 1000 + random() * 7000,
      intensity: 0.3 + random() * 0.7,
    });
  }

  return particles;
}

export function createWeatherParticleLayer(particles: WeatherParticle[]) {
  return new ScatterplotLayer<WeatherParticle>({
    id: 'weather-particles',
    data: particles,
    getPosition: (d) => [d.longitude, d.latitude, d.altitude],
    getRadius: (d) => 8000 * d.intensity,
    radiusMinPixels: 1,
    radiusMaxPixels: 8,
    getFillColor: (d) => [120, 190, 255, Math.round(120 * d.intensity)],
    pickable: false,
  });
}
