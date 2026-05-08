export type InfraSource = 'demo' | 'osm';

export type SubseaCable = {
  id: string;
  name: string;
  path: [number, number, number][];
  voltageKv?: number;
  operator?: string;
  infrastructureType: 'subsea-cable';
  source: InfraSource;
};

export type PowerLine = {
  id: string;
  name: string;
  path: [number, number, number][];
  voltageKv?: number;
  operator?: string;
  infrastructureType: 'power-line';
  source: InfraSource;
};

export type PowerPlantKind = 'nuclear' | 'hydro' | 'solar' | 'thermal' | 'wind' | 'battery' | 'unknown';

export type PowerPlant = {
  id: string;
  name: string;
  kind: PowerPlantKind;
  latitude: number;
  longitude: number;
  capacityMw: number;
  operator?: string;
  infrastructureType: 'power-plant';
  source: InfraSource;
};

export type Substation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  voltageKv?: number;
  operator?: string;
  infrastructureType: 'substation';
  source: InfraSource;
};

export const SUBSEA_CABLES: SubseaCable[] = [
  {
    id: 'cable-north-sea-link',
    name: 'North Sea Link',
    voltageKv: 525,
    path: [[1.72, 55.07, 0], [0.6, 56.6, 0], [1.4, 58.0, 0], [5.18, 59.74, 0]],
    infrastructureType: 'subsea-cable',
    source: 'demo',
  },
  {
    id: 'cable-nemo-link',
    name: 'Nemo Link',
    voltageKv: 400,
    path: [[1.42, 51.38, 0], [2.0, 51.3, 0], [2.62, 51.14, 0], [3.2, 51.27, 0]],
    infrastructureType: 'subsea-cable',
    source: 'demo',
  },
  {
    id: 'cable-basslink',
    name: 'Basslink',
    voltageKv: 400,
    path: [[145.67, -38.31, 0], [145.9, -39.1, 0], [146.2, -39.8, 0], [147.43, -41.13, 0]],
    infrastructureType: 'subsea-cable',
    source: 'demo',
  },
  {
    id: 'cable-sakuma-fc',
    name: 'Japan Interconnection Corridor',
    voltageKv: 500,
    path: [[139.75, 35.68, 0], [138.2, 35.0, 0], [136.9, 35.1, 0], [135.5, 34.7, 0]],
    infrastructureType: 'subsea-cable',
    source: 'demo',
  },
  {
    id: 'cable-tasman-ring',
    name: 'Tasman HVDC Concept',
    voltageKv: 500,
    path: [[151.2, -33.9, 0], [157.5, -37.0, 0], [166.8, -41.2, 0], [174.8, -41.3, 0]],
    infrastructureType: 'subsea-cable',
    source: 'demo',
  },
];

export const POWER_LINES: PowerLine[] = [
  {
    id: 'line-japan-500kv',
    name: 'Tokyo Chubu 500 kV Spine',
    voltageKv: 500,
    path: [[139.75, 35.68, 0], [138.6, 35.2, 0], [137.1, 35.0, 0], [136.9, 35.18, 0]],
    infrastructureType: 'power-line',
    source: 'demo',
  },
  {
    id: 'line-western-interconnect',
    name: 'Western Interconnect',
    voltageKv: 500,
    path: [[-122.33, 47.6, 0], [-121.5, 44.6, 0], [-120.0, 40.2, 0], [-118.24, 34.05, 0]],
    infrastructureType: 'power-line',
    source: 'demo',
  },
  {
    id: 'line-europe-supergrid',
    name: 'North Europe Supergrid',
    voltageKv: 400,
    path: [[-0.12, 51.5, 0], [4.9, 52.37, 0], [8.68, 50.11, 0], [13.4, 52.52, 0], [18.06, 59.33, 0]],
    infrastructureType: 'power-line',
    source: 'demo',
  },
  {
    id: 'line-china-east',
    name: 'East China UHV Corridor',
    voltageKv: 1000,
    path: [[116.4, 39.9, 0], [118.8, 36.2, 0], [120.2, 31.2, 0], [121.47, 31.23, 0]],
    infrastructureType: 'power-line',
    source: 'demo',
  },
  {
    id: 'line-brazil-hvdc',
    name: 'Brazil Hydro HVDC Backbone',
    voltageKv: 800,
    path: [[-54.59, -25.41, 0], [-50.2, -23.9, 0], [-47.9, -21.8, 0], [-43.2, -22.9, 0]],
    infrastructureType: 'power-line',
    source: 'demo',
  },
];

export const POWER_PLANTS: PowerPlant[] = [
  { id: 'pp-kashiwazaki', name: 'Kashiwazaki-Kariwa', kind: 'nuclear', latitude: 37.42, longitude: 138.60, capacityMw: 7965, infrastructureType: 'power-plant', source: 'demo' },
  { id: 'pp-three-gorges', name: 'Three Gorges', kind: 'hydro', latitude: 30.82, longitude: 111.00, capacityMw: 22500, infrastructureType: 'power-plant', source: 'demo' },
  { id: 'pp-taichung', name: 'Taichung Thermal', kind: 'thermal', latitude: 24.21, longitude: 120.48, capacityMw: 5500, infrastructureType: 'power-plant', source: 'demo' },
  { id: 'pp-noor-ouzazate', name: 'Noor Ouarzazate', kind: 'solar', latitude: 30.93, longitude: -6.90, capacityMw: 580, infrastructureType: 'power-plant', source: 'demo' },
  { id: 'pp-gansu-wind', name: 'Gansu Wind Farm', kind: 'wind', latitude: 39.80, longitude: 96.30, capacityMw: 10000, infrastructureType: 'power-plant', source: 'demo' },
  { id: 'pp-palo-verde', name: 'Palo Verde', kind: 'nuclear', latitude: 33.39, longitude: -112.86, capacityMw: 3937, infrastructureType: 'power-plant', source: 'demo' },
  { id: 'pp-itaipu', name: 'Itaipu Dam', kind: 'hydro', latitude: -25.41, longitude: -54.59, capacityMw: 14000, infrastructureType: 'power-plant', source: 'demo' },
  { id: 'pp-drax', name: 'Drax Power Station', kind: 'thermal', latitude: 53.75, longitude: -0.99, capacityMw: 3906, infrastructureType: 'power-plant', source: 'demo' },
  { id: 'pp-hornsea', name: 'Hornsea Offshore Wind', kind: 'wind', latitude: 54.1, longitude: 1.8, capacityMw: 1320, infrastructureType: 'power-plant', source: 'demo' },
  { id: 'pp-bhadla', name: 'Bhadla Solar Park', kind: 'solar', latitude: 27.54, longitude: 71.93, capacityMw: 2245, infrastructureType: 'power-plant', source: 'demo' },
  { id: 'pp-hornsdale', name: 'Hornsdale Power Reserve', kind: 'battery', latitude: -33.11, longitude: 138.69, capacityMw: 150, infrastructureType: 'power-plant', source: 'demo' },
];

export const SUBSTATIONS: Substation[] = [
  { id: 'sub-shin-shinano', name: 'Shin-Shinano FC', latitude: 36.12, longitude: 137.96, voltageKv: 500, infrastructureType: 'substation', source: 'demo' },
  { id: 'sub-celilo', name: 'Celilo Converter', latitude: 45.64, longitude: -121.10, voltageKv: 500, infrastructureType: 'substation', source: 'demo' },
  { id: 'sub-sylmar', name: 'Sylmar Converter', latitude: 34.31, longitude: -118.47, voltageKv: 500, infrastructureType: 'substation', source: 'demo' },
  { id: 'sub-britned', name: 'BritNed Converter', latitude: 51.95, longitude: 4.10, voltageKv: 450, infrastructureType: 'substation', source: 'demo' },
  { id: 'sub-itaipu', name: 'Itaipu Switchyard', latitude: -25.41, longitude: -54.59, voltageKv: 765, infrastructureType: 'substation', source: 'demo' },
];
