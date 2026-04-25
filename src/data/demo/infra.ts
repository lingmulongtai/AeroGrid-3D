export type SubseaCable = {
  id: string;
  name: string;
  path: [number, number, number][];
};

export type PowerPlant = {
  id: string;
  name: string;
  kind: 'nuclear' | 'hydro' | 'solar' | 'thermal' | 'wind';
  latitude: number;
  longitude: number;
  capacityMw: number;
};

export const SUBSEA_CABLES: SubseaCable[] = [
  {
    id: 'cable-tpc5',
    name: 'Trans-Pacific Link',
    path: [[139.76, 35.68, 0], [150, 40, 0], [170, 45, 0], [-145, 41, 0], [-122.33, 47.60, 0]],
  },
  {
    id: 'cable-atlantic-1',
    name: 'Atlantic Trunk',
    path: [[-74.00, 40.71, 0], [-50, 45, 0], [-25, 50, 0], [-0.12, 51.50, 0]],
  },
  {
    id: 'cable-eur-asia',
    name: 'Euro-Asia Corridor',
    path: [[28.97, 41.00, 0], [34, 36, 0], [45, 25, 0], [72.8, 19.07, 0], [103.82, 1.35, 0]],
  },
  {
    id: 'cable-africa-west',
    name: 'West Africa Ring',
    path: [[-9.14, 38.72, 0], [-5, 24, 0], [-0.2, 5.6, 0], [3.37, 6.52, 0], [18.42, -33.92, 0]],
  },
];

export const POWER_PLANTS: PowerPlant[] = [
  { id: 'pp-kashiwazaki', name: 'Kashiwazaki-Kariwa', kind: 'nuclear', latitude: 37.42, longitude: 138.60, capacityMw: 7965 },
  { id: 'pp-three-gorges', name: 'Three Gorges', kind: 'hydro', latitude: 30.82, longitude: 111.00, capacityMw: 22500 },
  { id: 'pp-taichung', name: 'Taichung Thermal', kind: 'thermal', latitude: 24.21, longitude: 120.48, capacityMw: 5500 },
  { id: 'pp-noor-ouzazate', name: 'Noor Ouarzazate', kind: 'solar', latitude: 30.93, longitude: -6.90, capacityMw: 580 },
  { id: 'pp-gansu-wind', name: 'Gansu Wind Farm', kind: 'wind', latitude: 39.80, longitude: 96.30, capacityMw: 10000 },
  { id: 'pp-palo-verde', name: 'Palo Verde', kind: 'nuclear', latitude: 33.39, longitude: -112.86, capacityMw: 3937 },
  { id: 'pp-itaipu', name: 'Itaipu Dam', kind: 'hydro', latitude: -25.41, longitude: -54.59, capacityMw: 14000 },
  { id: 'pp-drax', name: 'Drax Power Station', kind: 'thermal', latitude: 53.75, longitude: -0.99, capacityMw: 3906 },
  { id: 'pp-hornsea', name: 'Hornsea Offshore Wind', kind: 'wind', latitude: 54.1, longitude: 1.8, capacityMw: 1320 },
  { id: 'pp-bhadla', name: 'Bhadla Solar Park', kind: 'solar', latitude: 27.54, longitude: 71.93, capacityMw: 2245 },
];
