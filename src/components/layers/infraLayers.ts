import { ColumnLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { PowerLine, PowerPlant, PowerPlantKind, SubseaCable, Substation } from '../../data/demo/infra';

const PLANT_COLORS: Record<PowerPlantKind, [number, number, number, number]> = {
  nuclear: [220, 120, 255, 230],
  hydro: [60, 185, 255, 230],
  solar: [255, 198, 70, 230],
  thermal: [255, 112, 92, 230],
  wind: [150, 230, 255, 230],
  battery: [130, 255, 175, 230],
  unknown: [210, 220, 230, 210],
};

type InfraLabel = {
  name: string;
  longitude: number;
  latitude: number;
};

export function createInfraLayers({
  powerLines,
  cables,
  powerPlants,
  substations,
  showLabels,
}: {
  powerLines: PowerLine[];
  cables: SubseaCable[];
  powerPlants: PowerPlant[];
  substations: Substation[];
  showLabels: boolean;
}) {
  const layers: any[] = [
    new PathLayer<PowerLine>({
      id: 'power-line-halo',
      data: powerLines,
      getPath: (d) => d.path,
      getColor: (d) => {
        const c = voltageColor(d.voltageKv);
        return [c[0], c[1], c[2], 42];
      },
      getWidth: (d) => lineWidth(d.voltageKv) + 5,
      widthUnits: 'pixels',
      jointRounded: true,
      capRounded: true,
      pickable: false,
    }),
    new PathLayer<PowerLine>({
      id: 'power-lines',
      data: powerLines,
      getPath: (d) => d.path,
      getColor: (d) => voltageColor(d.voltageKv),
      getWidth: (d) => lineWidth(d.voltageKv),
      widthUnits: 'pixels',
      jointRounded: true,
      capRounded: true,
      pickable: true,
    }),
    new PathLayer<SubseaCable>({
      id: 'subsea-cable-halo',
      data: cables,
      getPath: (d) => d.path,
      getColor: [35, 225, 255, 46],
      getWidth: (d) => Math.max(5, lineWidth(d.voltageKv) + 4),
      widthUnits: 'pixels',
      jointRounded: true,
      capRounded: true,
      pickable: false,
    }),
    new PathLayer<SubseaCable>({
      id: 'subsea-cables',
      data: cables,
      getPath: (d) => d.path,
      getColor: [76, 229, 255, 205],
      getWidth: (d) => Math.max(1.8, lineWidth(d.voltageKv) * 0.8),
      widthUnits: 'pixels',
      jointRounded: true,
      capRounded: true,
      pickable: true,
    }),
    new ScatterplotLayer<PowerPlant>({
      id: 'power-plant-glow',
      data: powerPlants,
      getPosition: (d) => [d.longitude, d.latitude, 0],
      getFillColor: (d) => {
        const c = PLANT_COLORS[d.kind] ?? PLANT_COLORS.unknown;
        return [c[0], c[1], c[2], 70];
      },
      getRadius: (d) => Math.max(9000, Math.min(42000, Math.sqrt(d.capacityMw || 80) * 530)),
      radiusMinPixels: 3,
      radiusMaxPixels: 18,
      pickable: false,
    }),
    new ColumnLayer<PowerPlant>({
      id: 'power-plants',
      data: powerPlants,
      diskResolution: 6,
      radius: 6200,
      elevationScale: 1,
      extruded: true,
      getElevation: (d) => Math.max(8000, Math.min(95000, Math.sqrt(d.capacityMw || 80) * 1100)),
      getPosition: (d) => [d.longitude, d.latitude, 0],
      getFillColor: (d) => PLANT_COLORS[d.kind] ?? PLANT_COLORS.unknown,
      getLineColor: [255, 255, 255, 120],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
    }),
    new ColumnLayer<Substation>({
      id: 'substations',
      data: substations,
      diskResolution: 4,
      radius: 4300,
      elevationScale: 1,
      extruded: true,
      getElevation: (d) => Math.max(5000, Math.min(40000, (d.voltageKv ?? 110) * 75)),
      getPosition: (d) => [d.longitude, d.latitude, 0],
      getFillColor: (d) => {
        const c = voltageColor(d.voltageKv);
        return [c[0], c[1], c[2], 210];
      },
      getLineColor: [255, 255, 255, 95],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
    }),
  ];

  if (showLabels) {
    layers.push(
      new TextLayer<InfraLabel>({
        id: 'infra-labels',
        data: [
          ...powerPlants.map((d) => ({ name: d.name, longitude: d.longitude, latitude: d.latitude })),
          ...substations.map((d) => ({ name: d.name, longitude: d.longitude, latitude: d.latitude })),
        ].slice(0, 180),
        getPosition: (d) => [d.longitude, d.latitude, 0],
        getText: (d) => d.name,
        getSize: 10,
        getColor: [230, 240, 255, 185],
        billboard: true,
        getPixelOffset: [0, -12],
        background: true,
        getBackgroundColor: [4, 8, 14, 150],
        backgroundPadding: [4, 2],
      }),
    );
  }

  return layers;
}

function voltageColor(voltageKv?: number): [number, number, number, number] {
  if (!voltageKv) return [135, 215, 255, 190];
  if (voltageKv >= 750) return [255, 86, 96, 220];
  if (voltageKv >= 500) return [255, 145, 68, 218];
  if (voltageKv >= 300) return [255, 206, 86, 210];
  if (voltageKv >= 150) return [90, 220, 255, 205];
  return [135, 190, 255, 180];
}

function lineWidth(voltageKv?: number): number {
  if (!voltageKv) return 1.6;
  if (voltageKv >= 750) return 4.2;
  if (voltageKv >= 500) return 3.5;
  if (voltageKv >= 300) return 2.8;
  if (voltageKv >= 150) return 2.2;
  return 1.6;
}
