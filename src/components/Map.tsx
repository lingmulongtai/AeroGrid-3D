import { useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import {
  LightingEffect,
  AmbientLight,
  DirectionalLight,
} from '@deck.gl/core';
import { ScatterplotLayer } from '@deck.gl/layers';

import type { Flight } from '../hooks/useFlightData';
import type { SatelliteInfo, SatelliteGroup } from '../hooks/useSatelliteData';
import type { InfrastructureDataResult } from '../hooks/useInfrastructureData';
import type { SelectedObject } from './FlightInfoPanel';
import { MapControls } from './MapControls';
import { TiltedGlobeView } from './camera/TiltedGlobeView';
import { useAdvancedGlobeCamera, type GlobeViewState } from './camera/useAdvancedGlobeCamera';
import { createBasemapLayer, createWeatherTileLayer, type MapStyle } from './layers/basemapLayer';
import { createAirportLayers } from './layers/airportLayer';
import { createFlightLayers } from './layers/flightLayers';
import { createSatelliteLayers } from './layers/satelliteLayers';
import { createWeatherParticleLayer, createWeatherParticles } from './layers/weatherParticleLayer';
import { createInfraLayers } from './layers/infraLayers';
import { createSpaceLayers } from './layers/spaceLayers';
import { DEMO_AIRPORTS } from '../data/demo/airports';
import type { LayerVisibility } from '../types/layers';
import type { QualitySettings } from '../types/quality';
import { normalizeLongitude, projectFlightPosition } from '../utils/flightUtils';

const INITIAL_VIEW_STATE: GlobeViewState = {
  longitude: 139,
  latitude: 35,
  zoom: 1.25,
  pitch: 0,
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
  infrastructure: InfrastructureDataResult;
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
  infrastructure,
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
  const [motionNow, setMotionNow] = useState(() => Date.now());
  const satTrailsRef = useRef<Map<string, [number, number, number][]>>(new Map());
  const footprintLastCalcAt = useRef(0);

  const cameraHandlers = useAdvancedGlobeCamera(viewState, setViewState);

  useEffect(() => {
    onMainViewStateChange?.(viewState);
  }, [onMainViewStateChange, viewState]);

  useEffect(() => {
    if (!selectedObject) return undefined;
    const id = window.setInterval(() => setPulseAlpha((a) => (a > 80 ? a - 15 : 220)), 90);
    return () => window.clearInterval(id);
  }, [selectedObject]);

  useEffect(() => {
    if (!layers.flights || flights.length === 0 || quality.motionFps <= 0) return undefined;

    let frame = 0;
    let last = 0;
    const frameMs = 1000 / quality.motionFps;

    const tick = (time: number) => {
      if (time - last >= frameMs) {
        last = time;
        setMotionNow(Date.now());
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [flights.length, layers.flights, quality.motionFps]);

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
    () => flights
      .slice(0, quality.maxFlights)
      .map((flight) => projectFlightPosition(flight, motionNow)),
    [flights, motionNow, quality.maxFlights],
  );

  const visibleSatellites = useMemo(
    () => satellites.slice(0, quality.maxSatellites),
    [satellites, quality.maxSatellites],
  );

  const weatherParticles = useMemo(
    () => createWeatherParticles(quality.weatherParticles, 4242),
    [quality.weatherParticles],
  );

  const view = useMemo(
    () => new TiltedGlobeView({ id: 'globe', resolution: quality.globeResolution, nearZMultiplier: 0.02, farZMultiplier: 100 }),
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
      list.push(...createWeatherParticleLayer(weatherParticles));
    }

    if (layers.airports) {
      list.push(...createAirportLayers(DEMO_AIRPORTS, layers.labels));
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

    if (layers.powerLines || layers.subseaCables || layers.powerPlants || layers.substations) {
      const infra = createInfraLayers({
        powerLines: layers.powerLines ? infrastructure.powerLines : [],
        cables: layers.subseaCables ? infrastructure.subseaCables : [],
        powerPlants: layers.powerPlants ? infrastructure.powerPlants : [],
        substations: layers.substations ? infrastructure.substations : [],
        showLabels: layers.labels,
      });
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
    infrastructure,
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
    const now = performance.now();
    if (now - footprintLastCalcAt.current < 180) return;
    footprintLastCalcAt.current = now;

    const w = wrapperRef.current?.clientWidth ?? 0;
    const h = wrapperRef.current?.clientHeight ?? 0;
    if (!w || !h) return;

    try {
      const points = estimateCameraFootprint(viewState, w, h);
      if (points.length >= 3) onCameraFootprintChange(points);
    } catch {
      // Footprint projection can transiently fail during rapid globe transitions.
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

    if (object.infrastructureType) {
      const meta = [
        object.voltageKv ? `${object.voltageKv} kV` : null,
        object.capacityMw ? `${Math.round(object.capacityMw).toLocaleString()} MW` : null,
        object.operator,
        object.source?.toUpperCase?.(),
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
      return {
        html: `<div class="deck-tooltip-content"><strong>${object.name ?? object.infrastructureType}</strong><br/><span>${meta}</span></div>`,
        style: { background: 'none', border: 'none', padding: 0 },
      };
    }

    return null;
  };

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0"
      data-view-pitch={viewState.pitch.toFixed(1)}
      data-view-bearing={viewState.bearing.toFixed(1)}
      data-view-zoom={viewState.zoom.toFixed(2)}
      onWheel={(event) => cameraHandlers.onWheel({ srcEvent: event.nativeEvent })}
      onPointerDownCapture={(event) => {
        if (!event.ctrlKey && !event.altKey && !event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
          // Synthetic verification events may not own a real pointer capture.
        }
        cameraHandlers.onDragStart({ x: event.clientX, y: event.clientY, srcEvent: event.nativeEvent });
      }}
      onPointerMoveCapture={(event) => {
        if (!cameraHandlers.isCustomDragging()) return;
        event.preventDefault();
        event.stopPropagation();
        cameraHandlers.onDrag({ x: event.clientX, y: event.clientY, srcEvent: event.nativeEvent });
      }}
      onPointerUpCapture={(event) => {
        if (!cameraHandlers.isCustomDragging()) return;
        event.preventDefault();
        event.stopPropagation();
        try {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        } catch {
          // Matching pointer capture may already be released.
        }
        cameraHandlers.onDragEnd();
      }}
      onPointerCancelCapture={cameraHandlers.onDragEnd}
      style={{ background: 'radial-gradient(circle at 20% 10%, #10223c 0%, #071426 45%, #03060d 100%)' }}
    >
      <div className="absolute inset-0 overflow-visible">
        <DeckGL
          ref={deckRef}
          views={view}
          viewState={viewState}
          controller={{ inertia: true, doubleClickZoom: false, keyboard: true }}
          onViewStateChange={({ viewState: vs }: any) => {
            if (cameraHandlers.isCustomDragging()) return;
            setViewState(sanitizeViewState(vs));
          }}
          onDragStart={cameraHandlers.onDragStart}
          onDrag={cameraHandlers.onDrag}
          onDragEnd={cameraHandlers.onDragEnd}
          layers={layersList}
          effects={[lighting]}
          useDevicePixels={Math.min(window.devicePixelRatio || 1, quality.dpr)}
          parameters={{ cull: false } as any}
          getTooltip={getTooltip as any}
          onAfterRender={calcFootprint}
          onClick={({ object }: any) => {
            if (!object) return;
            if (object.callsign !== undefined) onFlightClick(object);
            else if (object.name && object.group) onSatelliteClick(object);
          }}
        />
      </div>

      <MapControls
        onZoomIn={() => setViewState((prev) => ({ ...prev, zoom: Math.min((prev.zoom ?? 1) + 0.8, 12) }))}
        onZoomOut={() => setViewState((prev) => ({ ...prev, zoom: Math.max((prev.zoom ?? 1) - 0.8, 0.5) }))}
        onResetView={() => setViewState(INITIAL_VIEW_STATE)}
        nightMode={nightLighting}
        onToggleNight={() => setNightLighting((v) => !v)}
      />

      <div className="absolute left-4 bottom-3 z-30 rounded-md border border-white/8 bg-black/45 px-2 py-1 text-[10px] text-neutral-400 backdrop-blur-md">
        <a className="hover:text-cyan-300" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
        <span className="mx-1 text-neutral-600">·</span>
        <span>{infrastructure.sourceLabel}</span>
      </div>
    </div>
  );
}

function sanitizeViewState(vs: GlobeViewState): GlobeViewState {
  return {
    ...vs,
    longitude: normalizeLongitude(vs.longitude),
    latitude: Math.max(-85, Math.min(85, vs.latitude)),
    zoom: Math.max(0.5, Math.min(14, vs.zoom)),
    pitch: Math.max(0, Math.min(70, vs.pitch ?? 0)),
    bearing: Number.isFinite(vs.bearing) ? vs.bearing : 0,
  };
}

function estimateCameraFootprint(viewState: GlobeViewState, width: number, height: number): [number, number][] {
  const scale = Math.max(1, Math.pow(2, viewState.zoom));
  const aspect = Math.max(0.65, Math.min(2.2, width / Math.max(1, height)));
  const pitchFactor = 1 + Math.max(0, viewState.pitch) / 80;
  const halfLon = Math.min(85, (360 / scale) * 0.36 * aspect * pitchFactor);
  const halfLat = Math.min(48, (170 / scale) * 0.32 * pitchFactor);
  const bearingRad = ((viewState.bearing ?? 0) * Math.PI) / 180;
  const cos = Math.cos(bearingRad);
  const sin = Math.sin(bearingRad);

  const corners: [number, number][] = [
    [-halfLon, -halfLat],
    [halfLon, -halfLat],
    [halfLon * (1 + viewState.pitch / 130), halfLat],
    [-halfLon * (1 + viewState.pitch / 130), halfLat],
  ];

  return corners.map(([x, y]) => {
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    return [
      normalizeLongitude(viewState.longitude + rx),
      Math.max(-85, Math.min(85, viewState.latitude + ry)),
    ] as [number, number];
  });
}
