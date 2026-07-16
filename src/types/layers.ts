export type LayerKey =
  | 'airports'
  | 'flights'
  | 'weather'
  | 'flightTrails'
  | 'labels';

export type LayerVisibility = Record<LayerKey, boolean>;

export const DEFAULT_LAYERS: LayerVisibility = {
  airports: true,
  flights: true,
  weather: true,
  flightTrails: false,
  labels: false,
};
