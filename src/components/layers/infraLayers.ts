import { MVTLayer } from '@deck.gl/geo-layers';
import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { Feature, Geometry } from 'geojson';
import type { SubseaCable, PowerPlant } from '../../data/demo/infra';

const OPENINFRA_ATTRIBUTION = '© OpenStreetMap contributors / OpenInfraMap';
const POWER_TILEJSON = {
  tilejson: '2.2.0',
  name: 'OpenInfraMap power',
  tiles: ['https://openinframap.org/map/power/{z}/{x}/{y}.pbf'],
  minzoom: 0,
  maxzoom: 17,
  attribution: OPENINFRA_ATTRIBUTION,
};
const TELECOMS_TILEJSON = {
  tilejson: '2.2.0',
  name: 'OpenInfraMap telecoms',
  tiles: ['https://openinframap.org/map/telecoms/{z}/{x}/{y}.pbf'],
  minzoom: 0,
  maxzoom: 17,
  attribution: OPENINFRA_ATTRIBUTION,
};

type MvtFeature = Feature<Geometry, { layerName?: string; voltage?: string; plant_source?: string; type?: string }>;

const KIND_COLORS: Record<PowerPlant['kind'], [number, number, number, number]> = {
  nuclear: [220, 110, 255, 210],
  hydro: [60, 190, 255, 210],
  solar: [255, 190, 60, 210],
  thermal: [255, 110, 90, 210],
  wind: [150, 220, 255, 210],
};

function layerName(feature: MvtFeature): string {
  return feature.properties?.layerName ?? '';
}

function voltageWidth(feature: MvtFeature): number {
  const voltage = String(feature.properties?.voltage ?? '');
  const maxVoltage = Math.max(...voltage.split(';').map((v) => Number.parseInt(v, 10)).filter(Number.isFinite), 0);
  if (maxVoltage >= 500000) return 4.2;
  if (maxVoltage >= 220000) return 3.2;
  if (maxVoltage >= 110000) return 2.4;
  return 1.6;
}

function powerLineColor(feature: MvtFeature): [number, number, number, number] {
  const name = layerName(feature);
  if (name.includes('substation')) return [120, 190, 255, 190];
  if (name.includes('plant') || name.includes('generator')) return [255, 190, 70, 220];
  if (name.includes('tower') || name.includes('transformer')) return [180, 220, 255, 150];
  return [255, 214, 80, 215];
}

function powerPointRadius(feature: MvtFeature): number {
  const name = layerName(feature);
  if (name.includes('plant')) return 15000;
  if (name.includes('generator')) return 9000;
  if (name.includes('substation')) return 7500;
  if (name.includes('tower')) return 2600;
  return 0;
}

function telecomPointRadius(feature: MvtFeature): number {
  const name = layerName(feature);
  if (name.includes('data_center')) return 11000;
  if (name.includes('mast')) return 4500;
  return 0;
}

function createOpenInfraPowerLayer() {
  return new MVTLayer<MvtFeature['properties']>({
    id: 'opengridworks-power-map',
    data: POWER_TILEJSON,
    binary: false,
    minZoom: 0,
    maxZoom: 17,
    maxRequests: 16,
    refinementStrategy: 'best-available',
    pointType: 'circle',
    stroked: true,
    filled: true,
    lineBillboard: true,
    lineJointRounded: true,
    lineCapRounded: true,
    getLineColor: powerLineColor,
    getLineWidth: (feature: MvtFeature) => layerName(feature).includes('line') ? voltageWidth(feature) : 0,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 0,
    lineWidthMaxPixels: 5,
    getFillColor: (feature: MvtFeature) => {
      const name = layerName(feature);
      if (name.includes('plant')) return [255, 185, 75, 90];
      if (name.includes('substation')) return [85, 165, 255, 85];
      if (name.includes('generator')) return [255, 220, 110, 70];
      return [0, 0, 0, 0];
    },
    getPointRadius: powerPointRadius,
    pointRadiusUnits: 'meters',
    pointRadiusMinPixels: 1.5,
    pointRadiusMaxPixels: 10,
    pickable: true,
  } as any);
}

function createOpenInfraTelecomsLayer() {
  return new MVTLayer<MvtFeature['properties']>({
    id: 'opengridworks-telecoms-map',
    data: TELECOMS_TILEJSON,
    binary: false,
    minZoom: 0,
    maxZoom: 17,
    maxRequests: 12,
    refinementStrategy: 'best-available',
    pointType: 'circle',
    stroked: true,
    filled: true,
    lineBillboard: true,
    lineJointRounded: true,
    lineCapRounded: true,
    getLineColor: (feature: MvtFeature) => layerName(feature).includes('communication_line') ? [70, 220, 255, 180] : [0, 0, 0, 0],
    getLineWidth: (feature: MvtFeature) => layerName(feature).includes('communication_line') ? 1.8 : 0,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 0,
    lineWidthMaxPixels: 3,
    getFillColor: (feature: MvtFeature) => layerName(feature).includes('data_center') ? [80, 235, 255, 190] : [145, 210, 255, 125],
    getPointRadius: telecomPointRadius,
    pointRadiusUnits: 'meters',
    pointRadiusMinPixels: 1.5,
    pointRadiusMaxPixels: 8,
    pickable: true,
  } as any);
}

export function createInfraLayers({
  cables,
  powerPlants,
  showLabels,
  showPowerGrid,
  showTelecoms,
}: {
  cables: SubseaCable[];
  powerPlants: PowerPlant[];
  showLabels: boolean;
  showPowerGrid: boolean;
  showTelecoms: boolean;
}) {
  const layers: any[] = [];

  if (showPowerGrid) {
    layers.push(createOpenInfraPowerLayer());
    layers.push(
      new ScatterplotLayer<PowerPlant>({
        id: 'featured-power-plants',
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
    );
  }

  if (showTelecoms) {
    layers.push(createOpenInfraTelecomsLayer());
    layers.push(
      new PathLayer<SubseaCable>({
        id: 'featured-subsea-cables',
        data: cables,
        getPath: (d) => d.path,
        getColor: [80, 220, 255, 130],
        getWidth: 2,
        widthUnits: 'pixels',
        jointRounded: true,
        capRounded: true,
        pickable: true,
      }),
    );
  }

  if (showLabels && showPowerGrid) {
    layers.push(
      new TextLayer<PowerPlant>({
        id: 'power-plant-labels',
        data: powerPlants,
        getPosition: (d) => [d.longitude, d.latitude, 0],
        getText: (d) => d.name,
        getSize: 10,
        getColor: [60, 40, 20, 210],
        billboard: true,
        getPixelOffset: [0, -10],
      }),
    );
  }

  return layers;
}
