export type LayerKey =
  | 'airports'
  | 'flights'
  | 'satellites'
  | 'weather'
  | 'flightTrails'
  | 'labels';

export type LayerVisibility = Record<LayerKey, boolean>;

export const DEFAULT_LAYERS: LayerVisibility = {
  airports: true,
  flights: true,
  satellites: true,
  weather: true,
  flightTrails: false,
  labels: false,
};
