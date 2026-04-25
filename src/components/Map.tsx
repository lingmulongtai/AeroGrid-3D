import { useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import {
  _GlobeView as GlobeView,
  LightingEffect,
  AmbientLight,
  DirectionalLight,
} from '@deck.gl/core';
import { ScatterplotLayer } from '@deck.gl/layers';

import type { Flight } from '../hooks/useFlightData';
import type { SatelliteInfo, SatelliteGroup } from '../hooks/useSatelliteData';
import type { SelectedObject } from './FlightInfoPanel';
import { MapControls } from './MapControls';
import { useAdvancedGlobeCamera, type GlobeViewState } from './camera/useAdvancedGlobeCamera';
import { createBasemapLayer, createWeatherTileLayer, type MapStyle } from './layers/basemapLayer';
import { createAirportLayers } from './layers/airportLayer';
import { createFlightLayers } from './layers/flightLayers';
import { createSatelliteLayers } from './layers/satelliteLayers';
import { createWeatherParticleLayer, createWeatherParticles } from './layers/weatherParticleLayer';
import { createInfraLayers } from './layers/infraLayers';
import { createSpaceLayers } from './layers/spaceLayers';
import { DEMO_AIRPORTS } from '../data/demo/airports';
import { POWER_PLANTS, SUBSEA_CABLES } from '../data/demo/infra';
import type { LayerVisibility } from '../types/layers';
import type { QualitySettings } from '../types/quality';

const INITIAL_VIEW_STATE: GlobeViewState = {
  longitude: 139,
  latitude: 35,
  zoom: 1.25,
  pitch: 10,
  bearing: 0,
};

function makeLighting(nightMode: boolean) {
  return new LightingEffect({
    ambient: new AmbientLight({ color: [255, 255, 255], intensity: nightMode ? 0.2 : 0.8 }),
    dir: new DirectionalLight({
      color: [255, 240, 200],
      intensity: nightMode ? 0.6 : 1.8,
      direction: [-1, -3, -1],
    }),
  });
}

interface MapProps {
  layers: LayerVisibility;
  colorMode: ColorMode;
  mapStyle: MapStyle;
  flights: Flight[];
  satellites: SatelliteInfo[];
  activeGroups: Set<SatelliteGroup>;
  radarTileUrl: string | null;
  selectedObject: SelectedObject;
  trackedObject: SelectedObject;
  quality: QualitySettings;
  onFlightClick: (f: Flight) => void;
  onSatelliteClick: (s: SatelliteInfo) => void;
  onCameraFootprintChange: (points: [number, number][]) => void;
  onMainViewStateChange?: (vs: GlobeViewState) => void;
}

export type ColorMode = 'altitude' | 'speed' | 'category';

export default function EarthMap({
  layers,
  colorMode,
  mapStyle,
  flights,
  satellites,
  activeGroups,
  radarTileUrl,
  selectedObject,
  trackedObject,
  quality,
  onFlightClick,
  onSatelliteClick,
  onCameraFootprintChange,
  onMainViewStateChange,
}: MapProps) {
  const deckRef = useRef<any>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [viewState, setViewState] = useState<GlobeViewState>(INITIAL_VIEW_STATE);
  const [nightLighting, setNightLighting] = useState(false);
  const [pulseAlpha, setPulseAlpha] = useState(220);
  const satTrailsRef = useRef<Map<string, [number, number, number][]>>(new Map());

  const cameraHandlers = useAdvancedGlobeCamera(viewState, setViewState);

  useEffect(() => {
    onMainViewStateChange?.(viewState);
  }, [onMainViewStateChange, viewState]);

  useEffect(() => {
    const id = setInterval(() => setPulseAlpha((a) => (a > 80 ? a - 15 : 220)), 80);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!trackedObject) return;
    const target = trackedObject.data;
    if (!target) return;

    setViewState((prev) => ({
      ...prev,
      longitude: target.longitude,
      latitude: target.latitude,
      transitionDuration: 900,
    }));
  }, [trackedObject]);

  useEffect(() => {
    const trailMap = satTrailsRef.current;
    satellites.forEach((sat) => {
      const prev = trailMap.get(sat.id) ?? [];
      const next = [...prev, [sat.longitude, sat.latitude, sat.altitude] as [number, number, number]].slice(-14);
      trailMap.set(sat.id, next);
    });
  }, [satellites]);

  useEffect(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, quality.dpr);
    deckRef.current?.setProps?.({ useDevicePixels: dpr });
  }, [quality.dpr]);

  const lighting = useMemo(() => makeLighting(nightLighting), [nightLighting]);

  const visibleFlights = useMemo(
    () => flights.slice(0, quality.maxFlights),
    [flights, quality.maxFlights],
  );

  const visibleSatellites = useMemo(
    () => satellites.slice(0, quality.maxSatellites),
    [satellites, quality.maxSatellites],
  );

  const weatherParticles = useMemo(
    () => createWeatherParticles(quality.weatherParticles, Math.round(viewState.longitude * 10 + viewState.latitude * 3 + 99)),
    [quality.weatherParticles, viewState.latitude, viewState.longitude],
  );

  const view = useMemo(
    () => new GlobeView({ id: 'globe', resolution: quality.globeResolution, nearZMultiplier: 0.02, farZMultiplier: 100 }),
    [quality.globeResolution],
  );

  const layersList = useMemo(() => {
    const list: any[] = [];

    list.push(...createSpaceLayers());
    list.push(createBasemapLayer(mapStyle, quality));

    if (layers.weather && radarTileUrl) {
      list.push(createWeatherTileLayer(radarTileUrl));
    }

    if (layers.weather) {
      list.push(createWeatherParticleLayer(weatherParticles));
    }

    if (layers.airports) {
      list.push(...createAirportLayers(DEMO_AIRPORTS, layers.labels, () => {}));
    }

    if (layers.flights) {
      list.push(...createFlightLayers({
        flights: visibleFlights,
        colorMode,
        showTrails: layers.flightTrails,
        onFlightClick,
      }));
    }

    if (layers.satellites) {
      list.push(...createSatelliteLayers({
        satellites: visibleSatellites,
        activeGroups,
        showLabels: layers.labels,
        showTrails: layers.satelliteTrails,
        trailsById: satTrailsRef.current,
        onSatelliteClick,
      }));
    }

    if (layers.subseaCables || layers.powerPlants) {
      const infra = createInfraLayers(
        layers.subseaCables ? SUBSEA_CABLES : [],
        layers.powerPlants ? POWER_PLANTS : [],
        layers.labels,
      );
      list.push(...infra);
    }

    if (selectedObject) {
      list.push(
        new ScatterplotLayer({
          id: 'selected-highlight',
          data: [selectedObject.data],
          getPosition: (d: any) => [d.longitude, d.latitude, d.altitude ?? 0],
          getFillColor: [255, 255, 255, 0],
          getRadius: selectedObject.type === 'satellite' ? 80000 : 30000,
          radiusMinPixels: 10,
          stroked: true,
          lineWidthMinPixels: 2,
          getLineColor: [255, 255, 255, pulseAlpha],
          getLineWidth: 3000,
          pickable: false,
        }),
      );
    }

    return list;
  }, [
    activeGroups,
    colorMode,
    layers,
    mapStyle,
    onFlightClick,
    onSatelliteClick,
    pulseAlpha,
    quality,
    radarTileUrl,
    selectedObject,
    visibleFlights,
    visibleSatellites,
    weatherParticles,
  ]);

  function calcFootprint() {
    const vp = deckRef.current?.deck?.getViewports?.()?.[0];
    const w = wrapperRef.current?.clientWidth ?? 0;
    const h = wrapperRef.current?.clientHeight ?? 0;
    if (!vp || !w || !h) return;

    try {
      const corners = [[0, 0], [w, 0], [w, h], [0, h]] as [number, number][];
      const points = corners
        .map(([x, y]) => {
          const p = vp.unproject([x, y]);
          if (!p || Number.isNaN(p[0]) || Number.isNaN(p[1])) return null;
          return [p[0], p[1]] as [number, number];
        })
        .filter(Boolean) as [number, number][];
      if (points.length >= 3) onCameraFootprintChange(points);
    } catch {
      // no-op
    }
  }

  const getTooltip = ({ object }: any) => {
    if (!object) return null;

    if (object.callsign) {
      return {
        html: `<div class="deck-tooltip-content"><strong>${object.callsign}</strong><br/><span>${Math.round(object.velocity * 1.94384)} kt &nbsp;·&nbsp; ${Math.round(object.altitude).toLocaleString()} m</span></div>`,
        style: { background: 'none', border: 'none', padding: 0 },
      };
    }

    if (object.name && object.group) {
      return {
        html: `<div class="deck-tooltip-content"><strong>${object.name}</strong><br/><span>${Math.round(object.altitude / 1000)} km orbit</span></div>`,
        style: { background: 'none', border: 'none', padding: 0 },
      };
    }

    if (object.iata) {
      return {
        html: `<div class="deck-tooltip-content"><strong>${object.iata}</strong> ${object.name}<br/><span>${object.city}, ${object.country}</span></div>`,
        style: { background: 'none', border: 'none', padding: 0 },
      };
    }

    return null;
  };

  return (
    <div ref={wrapperRef} className="absolute inset-0" style={{ background: 'radial-gradient(circle at 20% 10%, #10223c 0%, #071426 45%, #03060d 100%)' }}>
      <DeckGL
        ref={deckRef}
        views={view}
        viewState={viewState}
        controller={{ inertia: true, dragRotate: true, doubleClickZoom: false }}
        onViewStateChange={({ viewState: vs }: any) => {
          setViewState(vs);
          setTimeout(calcFootprint, 0);
        }}
        onDragStart={cameraHandlers.onDragStart}
        onDrag={cameraHandlers.onDrag}
        onDragEnd={cameraHandlers.onDragEnd}
        onWheel={cameraHandlers.onWheel}
        layers={layersList}
        effects={[lighting]}
        getTooltip={getTooltip as any}
        parameters={{
          cull: false,
          depthTest: true,
          blend: true,
          antialias: true,
        }}
        onAfterRender={calcFootprint}
        onClick={({ object }: any) => {
          if (!object) return;
          if (object.callsign !== undefined) onFlightClick(object);
          else if (object.name && object.group) onSatelliteClick(object);
        }}
      />

      <MapControls
        onZoomIn={() => setViewState((prev) => ({ ...prev, zoom: Math.min((prev.zoom ?? 1) + 0.8, 12) }))}
        onZoomOut={() => setViewState((prev) => ({ ...prev, zoom: Math.max((prev.zoom ?? 1) - 0.8, 0.5) }))}
        onResetView={() => setViewState(INITIAL_VIEW_STATE)}
        nightMode={nightLighting}
        onToggleNight={() => setNightLighting((v) => !v)}
      />
    </div>
  );
}
