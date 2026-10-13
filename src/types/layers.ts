export type LayerKey =
  | 'airports'
  | 'flights'
  | 'satellites'
  | 'weather'
  | 'flightTrails'
  | 'satelliteTrails'
  | 'ships'
  | 'cameras'
  | 'labels';

export type LayerVisibility = Record<LayerKey, boolean>;

export const DEFAULT_LAYERS: LayerVisibility = {
  airports: true,
  flights: true,
  satellites: true,
  weather: true,
  flightTrails: false,
  satelliteTrails: true,
  ships: false,
  cameras: false,
  labels: false,
};
