import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';

import EarthMap, { type ColorMode } from './components/Map';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { SearchBar } from './components/SearchBar';
import { FlightInfoPanel, type SelectedObject } from './components/FlightInfoPanel';
import { SettingsModal } from './components/ui/SettingsModal';
import { Minimap } from './components/ui/Minimap';
import { type GlobeViewState } from './components/camera/useAdvancedGlobeCamera';

import { useSatelliteData, type SatelliteGroup } from './hooks/useSatelliteData';
import { useServerData } from './hooks/useServerData';

import type { Flight } from './hooks/useFlightData';
import type { SatelliteInfo } from './hooks/useSatelliteData';
import { DEFAULT_LAYERS, type LayerKey, type LayerVisibility } from './types/layers';
import { DEFAULT_QUALITY, QUALITY_PRESETS, type QualityPreset, type QualitySettings } from './types/quality';
import { type MapStyle } from './components/layers/basemapLayer';

export default function App() {
  const INCLUDE_ON_GROUND_FLIGHTS = true;
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [activeGroups, setActiveGroups] = useState<Set<SatelliteGroup>>(
    new Set(['stations', 'starlink', 'weather', 'gps', 'active']),
  );
  const [colorMode, setColorMode] = useState<ColorMode>('altitude');
  const [mapStyle, setMapStyle] = useState<MapStyle>('dark');

  const [quality, setQuality] = useState<QualitySettings>(DEFAULT_QUALITY);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  const [selectedObject, setSelectedObject] = useState<SelectedObject>(null);
  const [trackedObject, setTrackedObject] = useState<SelectedObject>(null);
  const [cameraFootprint, setCameraFootprint] = useState<[number, number][]>([]);
  const [mainViewState, setMainViewState] = useState({
    longitude: 139,
    latitude: 35,
    zoom: 1.25,
    pitch: 10,
    bearing: 0,
  });

  const { flights, flightStats, radarTileUrl, wsConnected } = useServerData(
    layers.flights,
    layers.weather,
    INCLUDE_ON_GROUND_FLIGHTS,
  );
  const { satellites, groupCounts } = useSatelliteData(layers.satellites, activeGroups);
  const lastMiniUpdateRef = useRef(0);
  const lastFootprintRef = useRef('');

  useEffect(() => {
    const onFull = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFull);
    return () => document.removeEventListener('fullscreenchange', onFull);
  }, []);

  function applyPreset(preset: QualityPreset) {
    setQuality(QUALITY_PRESETS[preset]);
  }

  function toggleLayer(key: LayerKey) {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleFlightClick(f: Flight) {
    setSelectedObject({ type: 'flight', data: f });
    setTrackedObject(null);
  }

  function handleSatelliteClick(s: SatelliteInfo) {
    setSelectedObject({ type: 'satellite', data: s });
    setTrackedObject(null);
  }

  function handleTrack(obj: SelectedObject) {
    setTrackedObject(obj);
  }

  const handleMainViewStateChange = useCallback((vs: GlobeViewState) => {
    const now = Date.now();
    if (now - lastMiniUpdateRef.current < 120) return;
    lastMiniUpdateRef.current = now;
    setMainViewState((prev) => {
      const closeEnough = Math.abs(prev.longitude - vs.longitude) < 0.08
        && Math.abs(prev.latitude - vs.latitude) < 0.08
        && Math.abs(prev.zoom - vs.zoom) < 0.04
        && Math.abs(prev.pitch - vs.pitch) < 1
        && Math.abs(prev.bearing - vs.bearing) < 1;
      return closeEnough ? prev : vs;
    });
  }, []);

  const handleCameraFootprintChange = useCallback((points: [number, number][]) => {
    const serialized = points
      .map(([lon, lat]) => `${lon.toFixed(2)},${lat.toFixed(2)}`)
      .join('|');
    if (serialized === lastFootprintRef.current) return;
    lastFootprintRef.current = serialized;
    setCameraFootprint(points);
  }, []);

  async function handleToggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
    } else {
      await document.documentElement.requestFullscreen?.();
    }
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black font-sans selection:bg-cyan-500/30">
      <EarthMap
        layers={layers}
        colorMode={colorMode}
        mapStyle={mapStyle}
        flights={flights}
        satellites={satellites}
        activeGroups={activeGroups}
        radarTileUrl={radarTileUrl}
        selectedObject={selectedObject}
        trackedObject={trackedObject}
        quality={quality}
        onFlightClick={handleFlightClick}
        onSatelliteClick={handleSatelliteClick}
        onCameraFootprintChange={handleCameraFootprintChange}
        onMainViewStateChange={handleMainViewStateChange}
      />

      <TopBar
        flightStats={flightStats}
        satelliteCount={satellites.length}
        wsConnected={wsConnected}
      />

      <SearchBar
        flights={flights}
        satellites={satellites}
        onSelect={(obj) => {
          setSelectedObject(obj);
          setTrackedObject(obj);
        }}
      />

      <Sidebar
        layers={layers}
        onToggleLayer={toggleLayer}
        activeGroups={activeGroups}
        setActiveGroups={setActiveGroups}
        colorMode={colorMode}
        setColorMode={setColorMode}
        mapStyle={mapStyle}
        setMapStyle={setMapStyle}
        qualityPreset={quality.preset}
        onOpenSettings={() => setSettingsOpen(true)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        flightStats={flightStats}
        satelliteCounts={groupCounts}
      />

      <AnimatePresence>
        {selectedObject && (
          <FlightInfoPanel
            selected={selectedObject}
            onClose={() => setSelectedObject(null)}
            onTrack={handleTrack}
          />
        )}
      </AnimatePresence>

      <Minimap
        mainViewState={mainViewState}
        cameraFootprint={cameraFootprint}
        mapStyle={mapStyle}
      />

      <SettingsModal
        open={settingsOpen}
        quality={quality}
        onApplyPreset={applyPreset}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
