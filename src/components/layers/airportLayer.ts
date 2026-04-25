import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { Airport } from '../../data/airports';

export function createAirportLayers(
  airports: Airport[],
  showLabels: boolean,
) {
  const layers: any[] = [
    new ScatterplotLayer<Airport>({
      id: 'airports',
      data: airports,
      getPosition: (d) => [d.longitude, d.latitude, 0],
      getFillColor: [170, 210, 255, 160],
      getRadius: 6000,
      radiusMinPixels: 3,
      radiusMaxPixels: 10,
      pickable: false,
      stroked: true,
      lineWidthMinPixels: 1,
      getLineColor: [255, 255, 255, 100],
      getLineWidth: 500,
    }),
  ];

  if (showLabels) {
    layers.push(
      new TextLayer<Airport>({
        id: 'airport-labels',
        data: airports,
        getPosition: (d) => [d.longitude, d.latitude, 0],
        getText: (d) => d.iata,
        getSize: 11,
        getColor: [255, 255, 255, 190],
        billboard: true,
        getPixelOffset: [0, -14],
        fontFamily: 'Inter, monospace',
      }),
    );
  }

  return layers;
}
