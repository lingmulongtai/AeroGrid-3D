import { ScatterplotLayer } from '@deck.gl/layers';

type SpaceBody = {
  id: string;
  longitude: number;
  latitude: number;
  altitude: number;
  color: [number, number, number, number];
  radius: number;
};

export function createSpaceLayers() {
  const stars: SpaceBody[] = Array.from({ length: 240 }, (_, i) => ({
    id: `star-${i}`,
    longitude: -180 + ((i * 137.5) % 360),
    latitude: -80 + ((i * 47.3) % 160),
    altitude: 1800000 + (i % 5) * 60000,
    color: [220, 230, 255, 120],
    radius: 9000,
  }));

  const moon: SpaceBody = {
    id: 'moon',
    longitude: 110,
    latitude: 18,
    altitude: 1500000,
    color: [220, 220, 235, 200],
    radius: 80000,
  };

  const sun: SpaceBody = {
    id: 'sun',
    longitude: -70,
    latitude: -8,
    altitude: 1700000,
    color: [255, 230, 150, 220],
    radius: 120000,
  };

  return [
    new ScatterplotLayer<SpaceBody>({
      id: 'space-stars',
      data: stars,
      getPosition: (d) => [d.longitude, d.latitude, d.altitude],
      getFillColor: (d) => d.color,
      getRadius: (d) => d.radius,
      radiusMinPixels: 1,
      radiusMaxPixels: 2,
      pickable: false,
    }),
    new ScatterplotLayer<SpaceBody>({
      id: 'space-bodies',
      data: [moon, sun],
      getPosition: (d) => [d.longitude, d.latitude, d.altitude],
      getFillColor: (d) => d.color,
      getRadius: (d) => d.radius,
      radiusMinPixels: 5,
      radiusMaxPixels: 16,
      pickable: false,
    }),
  ];
}
