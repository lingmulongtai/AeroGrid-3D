export type LayerKey =
  | 'airports'
  | 'flights'
  | 'satellites'
  | 'weather'
  | 'powerLines'
  | 'subseaCables'
  | 'powerPlants'
  | 'substations'
  | 'flightTrails'
  | 'labels'
  | 'satelliteTrails';

export type LayerVisibility = Record<LayerKey, boolean>;

export const DEFAULT_LAYERS: LayerVisibility = {
  airports: true,
  flights: true,
  satellites: true,
  weather: true,
  powerLines: true,
  subseaCables: true,
  powerPlants: true,
  substations: true,
  flightTrails: false,
  labels: false,
  satelliteTrails: false,
};
