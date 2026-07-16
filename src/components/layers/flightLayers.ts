import { PathLayer } from '@deck.gl/layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import type { FlightCategory, FlightRecord } from '../../../shared/contracts';
import { getFlightColor, getCategoryScale } from '../../utils/flightUtils';
import { createAircraftGeometries } from './modelGeometries';

const AIRCRAFT_GEOMETRIES = createAircraftGeometries();

const AIRFRAME_MATERIAL = {
  ambient: 0.42,
  diffuse: 0.72,
  shininess: 46,
  specularColor: [155, 190, 215] as [number, number, number],
};

const ENGINE_MATERIAL = {
  ambient: 0.32,
  diffuse: 0.58,
  shininess: 58,
  specularColor: [175, 195, 210] as [number, number, number],
};

const GLASS_MATERIAL = {
  ambient: 0.28,
  diffuse: 0.38,
  shininess: 92,
  specularColor: [215, 245, 255] as [number, number, number],
};

export function getAircraftScaleForZoom(category: FlightCategory, zoom: number): number {
  const [categoryScale] = getCategoryScale(category);
  const categoryFactor = Math.sqrt(categoryScale / 2);
  const zoomScale = 1_500 * 2 ** (-Math.max(0, zoom - 2) * 0.72);
  return Math.max(22, zoomScale) * categoryFactor;
}

export function getAircraftOrientation(flight: Pick<FlightRecord, 'heading' | 'verticalRate'>) {
  const pitch = Math.max(-11, Math.min(11, flight.verticalRate * 1.25));
  return [pitch, -flight.heading, 0] as [number, number, number];
}

export function createFlightLayers({
  flights,
  colorMode,
  showTrails,
  zoom,
  onFlightClick,
}: {
  flights: FlightRecord[];
  colorMode: 'altitude' | 'speed' | 'category';
  showTrails: boolean;
  zoom: number;
  onFlightClick: (flight: FlightRecord) => void;
}) {
  const layers: any[] = [];

  if (showTrails) {
    layers.push(
      new PathLayer<FlightRecord>({
        id: 'flight-trails',
        data: flights.filter((flight) => flight.positionHistory.length > 1),
        getPath: (flight) => flight.positionHistory as [number, number, number][],
        getColor: (flight) => {
          const color = getFlightColor(colorMode, flight.altitude, flight.velocity, flight.category);
          return [color[0], color[1], color[2], 105];
        },
        getWidth: 2,
        widthMinPixels: 1,
        widthUnits: 'pixels',
      }),
    );
  }

  const getPosition = (flight: FlightRecord) => [
    flight.longitude,
    flight.latitude,
    flight.altitude,
  ] as [number, number, number];
  const getScale = (flight: FlightRecord) => {
    const scale = getAircraftScaleForZoom(flight.category, zoom);
    return [scale, scale, scale] as [number, number, number];
  };
  const getOrientation = (flight: FlightRecord) => getAircraftOrientation(flight);

  layers.push(
    new SimpleMeshLayer<FlightRecord>({
      id: 'aircraft-airframes',
      data: flights,
      mesh: AIRCRAFT_GEOMETRIES.airframe,
      getPosition,
      getScale,
      getOrientation,
      getColor: (flight) => {
        const color = getFlightColor(colorMode, flight.altitude, flight.velocity, flight.category);
        return [color[0], color[1], color[2], 255];
      },
      material: AIRFRAME_MATERIAL,
      pickable: true,
      onClick: ({ object }: { object?: FlightRecord }) => object && onFlightClick(object),
      updateTriggers: { getScale: [zoom], getColor: [colorMode] },
    }),
    new SimpleMeshLayer<FlightRecord>({
      id: 'aircraft-engines',
      data: flights,
      mesh: AIRCRAFT_GEOMETRIES.engines,
      getPosition,
      getScale,
      getOrientation,
      getColor: [62, 72, 84, 255],
      material: ENGINE_MATERIAL,
      pickable: false,
      updateTriggers: { getScale: [zoom] },
    }),
    new SimpleMeshLayer<FlightRecord>({
      id: 'aircraft-glazing',
      data: flights,
      mesh: AIRCRAFT_GEOMETRIES.glazing,
      getPosition,
      getScale,
      getOrientation,
      getColor: [12, 30, 48, 255],
      material: GLASS_MATERIAL,
      pickable: false,
      updateTriggers: { getScale: [zoom] },
    }),
    new SimpleMeshLayer<FlightRecord>({
      id: 'aircraft-port-lights',
      data: flights,
      mesh: AIRCRAFT_GEOMETRIES.portLight,
      getPosition,
      getScale,
      getOrientation,
      getColor: [255, 70, 82, 255],
      material: false,
      pickable: false,
      updateTriggers: { getScale: [zoom] },
    }),
    new SimpleMeshLayer<FlightRecord>({
      id: 'aircraft-starboard-lights',
      data: flights,
      mesh: AIRCRAFT_GEOMETRIES.starboardLight,
      getPosition,
      getScale,
      getOrientation,
      getColor: [70, 255, 170, 255],
      material: false,
      pickable: false,
      updateTriggers: { getScale: [zoom] },
    }),
  );

  return layers;
}
