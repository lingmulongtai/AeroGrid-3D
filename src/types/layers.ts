export type LayerKey =
  | 'airports'
  | 'flights'
  | 'satellites'
  | 'weather'
  | 'subseaCables'
  | 'powerPlants'
  | 'flightTrails'
  | 'labels'
  | 'satelliteTrails';

export type LayerVisibility = Record<LayerKey, boolean>;

export const DEFAULT_LAYERS: LayerVisibility = {
  airports: true,
  flights: true,
  satellites: true,
  weather: true,
  subseaCables: true,
  powerPlants: true,
  flightTrails: true,
  labels: false,
  satelliteTrails: true,
};
