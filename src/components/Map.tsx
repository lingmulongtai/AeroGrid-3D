import { useEffect, useMemo, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { _GlobeView as GlobeView, AmbientLight, DirectionalLight, LightingEffect } from '@deck.gl/core';
import { ScatterplotLayer } from '@deck.gl/layers';
import type { AppMode, FlightRecord } from '../../shared/contracts';
import { MAJOR_AIRPORTS } from '../data/airports';
import type { LayerVisibility } from '../types/layers';
import type { QualitySettings } from '../types/quality';
import type { Translator } from '../i18n';
import { MapControls } from './MapControls';
import {
  MAX_GLOBE_ZOOM,
  MIN_GLOBE_ZOOM,
  getAdaptiveGlobeResolution,
  normalizeGlobeViewState,
  zoomGlobeView,
  type GlobeViewState,
} from './camera/useAdvancedGlobeCamera';
import { createAirportLayers } from './layers/airportLayer';
import { createBasemapLayers, createWeatherTileLayer, type MapStyle } from './layers/basemapLayer';
import { createFlightLayers } from './layers/flightLayers';
import { createSpaceLayers } from './layers/spaceLayers';
import { createWeatherParticleLayer, createWeatherParticles } from './layers/weatherParticleLayer';

const INITIAL_VIEW_STATE: GlobeViewState = {
  longitude: 139.76,
  latitude: 35.68,
  zoom: 1.35,
  minZoom: MIN_GLOBE_ZOOM,
  maxZoom: MAX_GLOBE_ZOOM,
};

export type ColorMode = 'altitude' | 'speed' | 'category';

interface MapProps {
  mode: AppMode;
  layers: LayerVisibility;
  colorMode: ColorMode;
  mapStyle: MapStyle;
  flights: FlightRecord[];
  radarTileUrl: string | null;
  weatherOpacity: number;
  selectedFlight: FlightRecord | null;
  trackedFlight: FlightRecord | null;
  quality: QualitySettings;
  onFlightClick: (flight: FlightRecord) => void;
  onViewStateChange: (viewState: GlobeViewState) => void;
  onWeatherTileError: () => void;
  t: Translator;
}

function createLighting(nightMode: boolean) {
  return new LightingEffect({
    ambient: new AmbientLight({ color: [210, 225, 255], intensity: nightMode ? 0.28 : 0.72 }),
    key: new DirectionalLight({ color: [255, 245, 220], intensity: nightMode ? 0.55 : 1.45, direction: [-1, -3, -1] }),
    rim: new DirectionalLight({ color: [120, 205, 255], intensity: nightMode ? 0.7 : 0.42, direction: [2, 1, 0.5] }),
  });
}

export function EarthMap({
  mode, layers, colorMode, mapStyle, flights, radarTileUrl, weatherOpacity,
  selectedFlight, trackedFlight, quality, onFlightClick, onViewStateChange, onWeatherTileError,
  t,
}: MapProps) {
  const [viewState, setViewState] = useState<GlobeViewState>(INITIAL_VIEW_STATE);
  const [nightLighting, setNightLighting] = useState(false);

  useEffect(() => onViewStateChange(viewState), [onViewStateChange, viewState]);

  useEffect(() => {
    if (!trackedFlight) return;
    setViewState((previous) => normalizeGlobeViewState({
      ...previous,
      longitude: trackedFlight.longitude,
      latitude: trackedFlight.latitude,
      transitionDuration: 900,
    }));
  }, [trackedFlight]);

  const visibleFlights = useMemo(() => flights.slice(0, quality.maxFlights), [flights, quality.maxFlights]);
  const weatherParticles = useMemo(
    () => createWeatherParticles(mode === 'demo' ? quality.weatherParticles : 0, 4242),
    [mode, quality.weatherParticles],
  );
  const view = useMemo(
    () => new GlobeView({
      id: 'globe',
      resolution: getAdaptiveGlobeResolution(viewState.zoom, quality.globeResolution),
      nearZMultiplier: 0.1,
      farZMultiplier: 4,
    }),
    [quality.globeResolution, viewState.zoom],
  );
  const lighting = useMemo(() => createLighting(nightLighting), [nightLighting]);

  const renderedLayers = useMemo(() => {
    const result: unknown[] = [...createSpaceLayers(), ...createBasemapLayers(mapStyle, quality)];
    if (layers.weather && mode === 'live-beta' && radarTileUrl) {
      result.push(createWeatherTileLayer(radarTileUrl, weatherOpacity, onWeatherTileError));
    }
    if (layers.weather && mode === 'demo') result.push(createWeatherParticleLayer(weatherParticles));
    if (layers.airports) result.push(...createAirportLayers(MAJOR_AIRPORTS, layers.labels));
    if (layers.flights) result.push(...createFlightLayers({
      flights: visibleFlights,
      colorMode,
      showTrails: layers.flightTrails,
      zoom: viewState.zoom,
      onFlightClick,
    }));
    if (selectedFlight) {
      result.push(new ScatterplotLayer<FlightRecord>({
        id: 'selected-flight', data: [selectedFlight],
        getPosition: (flight) => [flight.longitude, flight.latitude, flight.altitude],
        getFillColor: [255, 255, 255, 0], getRadius: 22_000, radiusMinPixels: 11,
        stroked: true, lineWidthMinPixels: 2, getLineColor: [255, 255, 255, 220], pickable: false,
      }));
    }
    return result;
  }, [colorMode, layers, mapStyle, mode, onFlightClick, onWeatherTileError, quality, radarTileUrl, selectedFlight, viewState.zoom, visibleFlights, weatherOpacity, weatherParticles]);

  const tooltip = ({ object }: { object?: FlightRecord }) => object ? {
    text: `${object.callsign}\n${Math.round(object.velocity * 1.94384)} kt · ${Math.round(object.altitude * 3.28084).toLocaleString()} ft`,
    style: { background: 'rgba(5, 10, 20, 0.92)', color: '#fff', border: '1px solid rgba(255,255,255,.12)', borderRadius: '10px', fontSize: '12px' },
  } : null;

  return (
    <div
      className="map-surface"
      data-mode={mode}
      data-zoom={viewState.zoom.toFixed(3)}
      data-longitude={viewState.longitude.toFixed(5)}
      data-latitude={viewState.latitude.toFixed(5)}
    >
      <DeckGL
        views={view}
        viewState={viewState}
        controller={{
          inertia: 250,
          dragRotate: false,
          touchRotate: false,
          doubleClickZoom: false,
          scrollZoom: { speed: 0.008, smooth: true },
          keyboard: true,
        }}
        onViewStateChange={({ viewState: next }: { viewState: GlobeViewState }) => {
          setViewState(normalizeGlobeViewState(next));
        }}
        layers={renderedLayers as never[]}
        effects={[lighting]}
        useDevicePixels={Math.min(window.devicePixelRatio || 1, quality.dpr)}
        getTooltip={tooltip as never}
        onClick={({ object }: { object?: FlightRecord }) => object && onFlightClick(object)}
      />
      <div className="globe-vignette" aria-hidden="true" />
      <MapControls
        onZoomIn={() => setViewState((previous) => zoomGlobeView(previous, 0.8))}
        onZoomOut={() => setViewState((previous) => zoomGlobeView(previous, -0.8))}
        onResetView={() => setViewState(INITIAL_VIEW_STATE)}
        nightMode={nightLighting}
        onToggleNight={() => setNightLighting((value) => !value)}
        t={t}
      />
    </div>
  );
}
