import { useEffect, useRef, useState } from 'react';
import type { AppMode, FlightRecord } from '../../shared/contracts';
import type { CloudProfile, PublicCamera, ShipRecord } from '../../shared/live';
import type { SatelliteRecord } from '../data/satellites';
import type { Translator } from '../i18n';
import type { LayerVisibility } from '../types/layers';
import type { QualitySettings } from '../types/quality';
import { GlobeEngine, type EngineStats, type HoverInfo, type PickResult, type Selection } from '../globe/engine';
import type { CameraSnapshot } from '../globe/controls';
import type { MapStyle } from '../globe/earth';
import type { ColorMode } from '../globe/layers/aircraft';
import { MapControls } from './MapControls';
import { MiniGlobe } from './MiniGlobe';

export type { ColorMode, MapStyle, Selection, PickResult, EngineStats };

export interface GlobeViewState {
  longitude: number;
  latitude: number;
  height: number;
  zoom: number;
  heading: number;
  pitch: number;
}

interface MapProps {
  mode: AppMode;
  layers: LayerVisibility;
  colorMode: ColorMode;
  mapStyle: MapStyle;
  flights: FlightRecord[];
  snapshotTime: string;
  radarTileUrl: string | null;
  radarCenter: { latitude: number; longitude: number };
  radarRadiusKm: number;
  weatherOpacity: number;
  selection: Selection | null;
  tracked: Selection | null;
  quality: QualitySettings;
  onPick: (result: PickResult | null) => void;
  onViewStateChange: (viewState: GlobeViewState) => void;
  onWeatherTileError: () => void;
  onTrackingInterrupted: () => void;
  onOpenSettings: () => void;
  onEngineReady?: (engine: GlobeEngine | null) => void;
  t: Translator;
  satellites: SatelliteRecord[];
  cloudProfiles: CloudProfile[];
  ships: ShipRecord[];
  cameras: PublicCamera[];
}

const E2E_OFFLINE_GLOBE = import.meta.env.VITE_E2E === 'true';

function toViewState(snapshot: CameraSnapshot): GlobeViewState {
  return {
    longitude: snapshot.longitude,
    latitude: snapshot.latitude,
    height: snapshot.altitude * 1000,
    zoom: Math.log2(40_000 / Math.max(0.05, snapshot.range)),
    heading: snapshot.heading,
    pitch: snapshot.tilt - 90,
  };
}

export function EarthMap({
  mode, layers, colorMode, mapStyle, flights, snapshotTime, radarTileUrl, radarCenter, radarRadiusKm,
  weatherOpacity, selection, tracked, quality, onPick, onViewStateChange, onWeatherTileError,
  onTrackingInterrupted, onOpenSettings, onEngineReady, t,
  satellites, cloudProfiles, ships, cameras,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<GlobeEngine | null>(null);
  const [camera, setCamera] = useState<CameraSnapshot>({ longitude: 139.76, latitude: 35.68, heading: 0, tilt: 0, range: 18_000, altitude: 18_000 });
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [realisticLighting, setRealisticLighting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const callbacks = useRef({ onPick, onViewStateChange, onTrackingInterrupted, onEngineReady });
  callbacks.current = { onPick, onViewStateChange, onTrackingInterrupted, onEngineReady };
  const flightsRef = useRef(new Map<string, FlightRecord>());
  const initialQuality = useRef(quality);

  useEffect(() => {
    if (!containerRef.current) return;
    let instance: GlobeEngine;
    try {
      instance = new GlobeEngine(containerRef.current, initialQuality.current, E2E_OFFLINE_GLOBE, {
        onCamera: (snapshot) => setCamera(snapshot),
        onCameraSettled: (snapshot) => {
          setCamera(snapshot);
          callbacks.current.onViewStateChange(toViewState(snapshot));
        },
        onPick: (result) => callbacks.current.onPick(result),
        onHover: setHover,
        onTrackingInterrupted: () => callbacks.current.onTrackingInterrupted(),
      });
    } catch (cause) {
      setError((cause as Error).message);
      return;
    }
    instance.flightLookup = (id) => flightsRef.current.get(id);
    if (import.meta.env.DEV) (window as unknown as { __globe?: GlobeEngine }).__globe = instance;
    setEngine(instance);
    callbacks.current.onEngineReady?.(instance);
    callbacks.current.onViewStateChange(toViewState(instance.snapshot()));
    return () => {
      callbacks.current.onEngineReady?.(null);
      setEngine(null);
      instance.dispose();
    };
  }, []);

  useEffect(() => { engine?.applyQuality(quality); }, [engine, quality]);
  useEffect(() => { engine?.setMapStyle(mapStyle); }, [engine, mapStyle]);
  useEffect(() => { engine?.setRealisticLighting(realisticLighting); }, [engine, realisticLighting]);
  useEffect(() => { engine?.setLayers(layers); }, [engine, layers]);
  useEffect(() => { engine?.setColorMode(colorMode); }, [engine, colorMode]);
  useEffect(() => { engine?.setSelection(selection); }, [engine, selection]);
  useEffect(() => { engine?.setSatellites(satellites); }, [engine, satellites]);
  useEffect(() => { engine?.setPublicContacts(ships, cameras); }, [engine, ships, cameras]);

  const colorModeRef = useRef(colorMode);
  colorModeRef.current = colorMode;
  useEffect(() => {
    if (!engine) return;
    flightsRef.current = new Map(flights.map((flight) => [flight.id, flight]));
    engine.setFlights(flights.slice(0, quality.maxFlights), Date.parse(snapshotTime) || Date.now(), colorModeRef.current);
  }, [engine, flights, snapshotTime, quality.maxFlights]);

  useEffect(() => {
    if (!engine) return;
    if (!layers.weather) engine.setWeather({ mode: 'off' }, weatherOpacity);
    else if (mode === 'demo') engine.setWeather({ mode: 'demo' }, weatherOpacity);
    else {
      engine.setCloudProfiles(cloudProfiles, weatherOpacity);
      engine.setRadarPrecipitation(E2E_OFFLINE_GLOBE ? null : radarTileUrl, radarCenter, radarRadiusKm, onWeatherTileError);
    }
  }, [engine, layers.weather, mode, cloudProfiles, weatherOpacity, radarTileUrl, radarCenter, radarRadiusKm, onWeatherTileError]);

  const trackedRef = useRef(tracked);
  trackedRef.current = tracked;
  const trackedKey = tracked ? `${tracked.kind}:${tracked.id}` : '';
  useEffect(() => {
    // Re-lock only when the tracked object changes, not on every data refresh.
    engine?.track(trackedRef.current);
  }, [engine, trackedKey]);

  const viewState = toViewState(camera);

  return (
    <div
      className="map-surface"
      data-engine="three"
      data-mode={mode}
      data-polar-coverage="full"
      data-map-style={mapStyle}
      data-zoom={viewState.zoom.toFixed(3)}
      data-camera-height={viewState.height.toFixed(0)}
      data-longitude={viewState.longitude.toFixed(5)}
      data-latitude={viewState.latitude.toFixed(5)}
      data-heading={viewState.heading.toFixed(2)}
      data-pitch={viewState.pitch.toFixed(2)}
      data-tracking={tracked ? tracked.kind : 'none'}
    >
      <div ref={containerRef} className="globe-container" />
      {error && <div className="globe-error" role="alert">{t('globe.unsupported')}</div>}
      {hover && (
        <div className="globe-tooltip" style={{ left: hover.x, top: hover.y }}>
          <strong>{hover.title}</strong>
          {hover.subtitle && <span>{hover.subtitle}</span>}
        </div>
      )}
      <div className="camera-hint">{t('controls.tiltHint')}</div>
      <MapControls
        heading={camera.heading}
        onZoomIn={() => engine?.zoom(true)}
        onZoomOut={() => engine?.zoom(false)}
        onResetView={() => engine?.resetView()}
        onResetNorth={() => engine?.resetNorth()}
        lighting={realisticLighting}
        onToggleLighting={() => setRealisticLighting((value) => !value)}
        onOpenSettings={onOpenSettings}
        t={t}
      />
      <MiniGlobe longitude={camera.longitude} latitude={camera.latitude} range={camera.range} heading={camera.heading} label={t('controls.miniGlobe')} />
    </div>
  );
}
