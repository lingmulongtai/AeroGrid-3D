import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { SubseaCable, PowerPlant } from '../../data/demo/infra';

const KIND_COLORS: Record<PowerPlant['kind'], [number, number, number, number]> = {
  nuclear: [220, 110, 255, 210],
  hydro: [60, 190, 255, 210],
  solar: [255, 190, 60, 210],
  thermal: [255, 110, 90, 210],
  wind: [150, 220, 255, 210],
};

export function createInfraLayers(
  cables: SubseaCable[],
  powerPlants: PowerPlant[],
  showLabels: boolean,
) {
  const layers: any[] = [
    new PathLayer<SubseaCable>({
      id: 'subsea-cables',
      data: cables,
      getPath: (d) => d.path,
      getColor: [80, 220, 255, 170],
      getWidth: 2,
      widthUnits: 'pixels',
      jointRounded: true,
      capRounded: true,
      pickable: true,
    }),
    new ScatterplotLayer<PowerPlant>({
      id: 'power-plants',
      data: powerPlants,
      getPosition: (d) => [d.longitude, d.latitude, 0],
      getFillColor: (d) => KIND_COLORS[d.kind],
      getRadius: (d) => Math.max(6000, Math.min(13000, d.capacityMw * 2.5)),
      radiusMinPixels: 2,
      radiusMaxPixels: 9,
      pickable: true,
      stroked: true,
      getLineColor: [255, 255, 255, 120],
      lineWidthMinPixels: 1,
    }),
  ];

  if (showLabels) {
    layers.push(
      new TextLayer<PowerPlant>({
        id: 'power-plant-labels',
        data: powerPlants,
        getPosition: (d) => [d.longitude, d.latitude, 0],
        getText: (d) => d.name,
        getSize: 10,
        getColor: [220, 230, 255, 170],
        billboard: true,
        getPixelOffset: [0, -10],
      }),
    );
  }

  return layers;
}
