import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import type { Flight } from '../../hooks/useFlightData';
import {
  getCategoryScale,
  getFlightColor,
  projectLngLat,
  type AircraftCategory,
} from '../../utils/flightUtils';
import { FIXED_WING_MESH, HELICOPTER_MESH } from './aircraftMeshes';

type MotionVector = {
  id: string;
  path: [number, number, number][];
  color: [number, number, number, number];
};

const MATERIAL = {
  ambient: 0.45,
  diffuse: 0.62,
  shininess: 42,
  specularColor: [255, 255, 255] as [number, number, number],
};

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
  const fixedWingFlights = flights.filter((f) => f.category !== 'helicopter');
  const helicopterFlights = flights.filter((f) => f.category === 'helicopter');
  const layers: any[] = [];

  layers.push(
    new ScatterplotLayer<Flight>({
      id: 'aircraft-presence-glow',
      data: flights,
      getPosition: (d) => [d.longitude, d.latitude, Math.max(0, d.altitude - 60)],
      getFillColor: (d) => {
        const c = getFlightColor(colorMode, d.altitude, d.velocity, d.category);
        return [c[0], c[1], c[2], d.onGround ? 55 : 82];
      },
      getRadius: (d) => aircraftSizeMeters(d.category) * (d.onGround ? 0.7 : 1.1),
      radiusMinPixels: 1,
      radiusMaxPixels: 12,
      pickable: false,
      stroked: false,
    }),
  );

  if (showTrails) {
    layers.push(
      new PathLayer<MotionVector>({
        id: 'flight-motion-vectors',
        data: flights
          .filter((f) => !f.onGround && f.velocity > 35)
          .map((f) => ({
            id: f.id,
            path: createVelocityVector(f),
            color: vectorColor(colorMode, f),
          })),
        getPath: (d) => d.path,
        getColor: (d) => d.color,
        getWidth: 1.8,
        widthMinPixels: 1,
        widthMaxPixels: 4,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        pickable: false,
      }),
    );
  }

  layers.push(
    new SimpleMeshLayer<Flight>({
      id: 'aircraft-fixed-wing-mesh',
      data: fixedWingFlights,
      mesh: FIXED_WING_MESH,
      sizeScale: 24_000,
      getPosition: getAircraftPosition,
      getColor: (d) => getAircraftMaterialColor(d, colorMode),
      getOrientation: getAircraftOrientation,
      getScale: (d) => {
        const scale = getScaleForCategory(d.category);
        return [scale, scale, Math.max(0.72, scale * 0.86)];
      },
      material: MATERIAL,
      pickable: true,
      onClick: ({ object }: any) => object && onFlightClick(object),
      updateTriggers: {
        getColor: [colorMode],
      },
    }),
    new SimpleMeshLayer<Flight>({
      id: 'aircraft-helicopter-mesh',
      data: helicopterFlights,
      mesh: HELICOPTER_MESH,
      sizeScale: 17_000,
      getPosition: getAircraftPosition,
      getColor: (d) => getAircraftMaterialColor(d, colorMode),
      getOrientation: getAircraftOrientation,
      getScale: [0.9, 0.9, 0.9],
      material: MATERIAL,
      pickable: true,
      onClick: ({ object }: any) => object && onFlightClick(object),
      updateTriggers: {
        getColor: [colorMode],
      },
    }),
  );

  return layers;
}

function getAircraftPosition(d: Flight): [number, number, number] {
  return [d.longitude, d.latitude, Math.max(0, d.altitude)];
}

function getAircraftOrientation(d: Flight): [number, number, number] {
  const climbPitch = Math.max(-10, Math.min(10, (d.verticalRate / Math.max(60, d.velocity)) * 240));
  const speedBank = Math.max(-6, Math.min(6, (d.velocity - 170) / 18));
  return [climbPitch, d.heading, d.category === 'helicopter' ? 0 : speedBank];
}

function getAircraftMaterialColor(
  d: Flight,
  colorMode: 'altitude' | 'speed' | 'category',
): [number, number, number, number] {
  const c = getFlightColor(colorMode, d.altitude, d.velocity, d.category);
  if (d.onGround) return [120, 130, 140, 175];
  return [Math.min(255, c[0] + 22), Math.min(255, c[1] + 22), Math.min(255, c[2] + 22), 235];
}

function vectorColor(
  colorMode: 'altitude' | 'speed' | 'category',
  flight: Flight,
): [number, number, number, number] {
  const c = getFlightColor(colorMode, flight.altitude, flight.velocity, flight.category);
  return [c[0], c[1], c[2], 130];
}

function createVelocityVector(flight: Flight): [number, number, number][] {
  const leadSeconds = Math.max(12, Math.min(44, flight.velocity / 5));
  const [endLon, endLat] = projectLngLat(
    flight.longitude,
    flight.latitude,
    flight.heading,
    flight.velocity * leadSeconds,
  );

  return [
    [flight.longitude, flight.latitude, flight.altitude],
    [endLon, endLat, Math.max(0, flight.altitude + flight.verticalRate * leadSeconds)],
  ];
}

function getScaleForCategory(category: AircraftCategory): number {
  const [scale] = getCategoryScale(category);
  return scale / 2.5;
}

function aircraftSizeMeters(category: AircraftCategory): number {
  switch (category) {
    case 'heavy': return 28_000;
    case 'large': return 22_000;
    case 'medium': return 18_000;
    case 'small': return 12_000;
    case 'light': return 9_000;
    case 'helicopter': return 8_000;
    default: return 14_000;
  }
}
