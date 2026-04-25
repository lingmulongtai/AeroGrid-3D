import { PathLayer, ScatterplotLayer, ColumnLayer } from '@deck.gl/layers';
import type { Flight } from '../../hooks/useFlightData';
import { getFlightColor, getCategoryScale, type AircraftCategory } from '../../utils/flightUtils';

const AIRCRAFT_GROUPS: { id: string; categories: AircraftCategory[] }[] = [
  { id: 'heavy', categories: ['heavy', 'large'] },
  { id: 'medium', categories: ['medium', 'unknown'] },
  { id: 'light', categories: ['small', 'light', 'helicopter'] },
];

export function createFlightLayers({
  flights,
  colorMode,
  showTrails,
  onFlightClick,
}: {
  flights: Flight[];
  colorMode: 'altitude' | 'speed' | 'category';
  showTrails: boolean;
  onFlightClick: (f: Flight) => void;
}) {
  const layers: any[] = [];

  if (showTrails) {
    layers.push(
      new PathLayer<Flight>({
        id: 'flight-trails',
        data: flights.filter((f) => f.positionHistory.length > 1),
        getPath: (d) => d.positionHistory as [number, number, number][],
        getColor: (d) => {
          const c = getFlightColor(colorMode, d.altitude, d.velocity, d.category);
          return [c[0], c[1], c[2], 120];
        },
        getWidth: 2,
        widthMinPixels: 1,
        widthUnits: 'pixels',
      }),
    );
  }

  layers.push(
    new ScatterplotLayer<Flight>({
      id: 'flight-dots',
      data: flights,
      getPosition: (d) => [d.longitude, d.latitude, d.altitude],
      getFillColor: (d) => getFlightColor(colorMode, d.altitude, d.velocity, d.category),
      getRadius: 9000,
      radiusMinPixels: 2,
      radiusMaxPixels: 8,
      pickable: true,
      onClick: ({ object }: any) => object && onFlightClick(object),
    }),
  );

  AIRCRAFT_GROUPS.forEach(({ id, categories }) => {
    const groupFlights = flights.filter((f) => categories.includes(f.category));
    if (groupFlights.length === 0) return;

    layers.push(
      new ColumnLayer<Flight>({
        id: `aircraft-voxel-${id}`,
        data: groupFlights,
        diskResolution: 4,
        radius: 7000,
        elevationScale: 1,
        extruded: true,
        getPosition: (d) => [d.longitude, d.latitude, d.altitude],
        getFillColor: (d) => {
          const c = getFlightColor(colorMode, d.altitude, d.velocity, d.category);
          return [c[0], c[1], c[2], 220];
        },
        getLineColor: [10, 10, 15, 220],
        wireframe: false,
        getElevation: (d) => 22000 * getCategoryScale(d.category)[0] * 0.15,
        pickable: true,
        onClick: ({ object }: any) => object && onFlightClick(object),
      }),
    );
  });

  return layers;
}
