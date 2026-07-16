export const MIN_GLOBE_ZOOM = 0.5;

// deck.gl changes GlobeView to WebMercatorViewport above zoom 12. Keeping the
// controlled camera just below that boundary prevents the projection jump that
// made the map appear to slide sideways at the end of a wheel gesture.
export const MAX_GLOBE_ZOOM = 11.75;

export type GlobeViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  transitionDuration?: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const wrapLongitude = (longitude: number) => {
  const wrapped = ((longitude + 180) % 360 + 360) % 360 - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
};

export function normalizeGlobeViewState(viewState: GlobeViewState): GlobeViewState {
  return {
    longitude: wrapLongitude(viewState.longitude),
    latitude: clamp(viewState.latitude, -85, 85),
    zoom: clamp(viewState.zoom, MIN_GLOBE_ZOOM, MAX_GLOBE_ZOOM),
    minZoom: MIN_GLOBE_ZOOM,
    maxZoom: MAX_GLOBE_ZOOM,
    ...(viewState.transitionDuration === undefined
      ? {}
      : { transitionDuration: viewState.transitionDuration }),
  };
}

export function zoomGlobeView(
  viewState: GlobeViewState,
  zoomDelta: number,
  transitionDuration = 260,
): GlobeViewState {
  return normalizeGlobeViewState({
    ...viewState,
    zoom: viewState.zoom + zoomDelta,
    transitionDuration,
  });
}

/**
 * GlobeView tessellates flat bitmap tiles into a spherical mesh. A fixed
 * one-degree mesh is acceptable from orbit, but visibly bends and shifts roads
 * at regional zooms. Increase tessellation only as the camera approaches the
 * surface so global exploration remains inexpensive.
 */
export function getAdaptiveGlobeResolution(zoom: number, presetResolution: number): number {
  let targetResolution: number;

  if (zoom < 2.25) targetResolution = 1;
  else if (zoom < 4) targetResolution = 0.5;
  else if (zoom < 6) targetResolution = 0.2;
  else if (zoom < 8) targetResolution = 0.08;
  else targetResolution = 0.04;

  return Math.min(presetResolution, targetResolution);
}
