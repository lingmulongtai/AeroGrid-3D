import { PathLayer } from '@deck.gl/layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import type { FlightRecord } from '../../../shared/contracts';
import { getFlightColor, getCategoryScale } from '../../utils/flightUtils';
import { createAircraftGeometry } from './modelGeometries';

const AIRCRAFT_GEOMETRY = createAircraftGeometry();

export function createFlightLayers({
  flights,
  colorMode,
  showTrails,
  onFlightClick,
}: {
  flights: FlightRecord[];
  colorMode: 'altitude' | 'speed' | 'category';
  showTrails: boolean;
  onFlightClick: (f: FlightRecord) => void;
}) {
  const layers: any[] = [];

  if (showTrails) {
    layers.push(
      new PathLayer<FlightRecord>({
        id: 'flight-trails',
        data: flights.filter((f) => f.positionHistory.length > 1),
        getPath: (d) => d.positionHistory as [number, number, number][],
        getColor: (d) => {
          const c = getFlightColor(colorMode, d.altitude, d.velocity, d.category);
          return [c[0], c[1], c[2], 105];
        },
        getWidth: 2,
        widthMinPixels: 1,
        widthUnits: 'pixels',
      }),
    );
  }

  layers.push(
    new SimpleMeshLayer<FlightRecord>({
      id: 'aircraft-models',
      data: flights,
      mesh: AIRCRAFT_GEOMETRY,
      getPosition: (d) => [d.longitude, d.latitude, d.altitude],
      getColor: (d) => getFlightColor(colorMode, d.altitude, d.velocity, d.category),
      getOrientation: (d) => [0, -d.heading, Math.max(-18, Math.min(18, d.verticalRate * 2.5))],
      getScale: (d) => {
        const [categoryScale] = getCategoryScale(d.category);
        const scale = 360 + categoryScale * 210;
        return [scale, scale, scale];
      },
      material: {
        ambient: 0.45,
        diffuse: 0.65,
        shininess: 24,
        specularColor: [90, 120, 140],
      },
      pickable: true,
      onClick: ({ object }: any) => object && onFlightClick(object),
    }),
  );

  return layers;
}
