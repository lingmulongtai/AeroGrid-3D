import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';

import EarthMap, { type ColorMode, type MapStyle, type ProjectionMode } from './components/Map';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { SearchBar } from './components/SearchBar';
import { FlightInfoPanel, type SelectedObject } from './components/FlightInfoPanel';

import { useFlightData } from './hooks/useFlightData';
import { useSatelliteData, type SatelliteGroup } from './hooks/useSatelliteData';
import { useWeatherData } from './hooks/useWeatherData';

import type { Flight } from './hooks/useFlightData';
import type { SatelliteInfo } from './hooks/useSatelliteData';
import type { Airport } from './data/airports';

export default function App() {
  // Layer visibility
  const [showFlights, setShowFlights] = useState(true);
  const [showSatellites, setShowSatellites] = useState(true);
  const [showWeather, setShowWeather] = useState(true);
  const [showAirports, setShowAirports] = useState(false);

  // Sub-toggles
  const [showTrails, setShowTrails] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [hideOnGround, setHideOnGround] = useState(true);

  // Satellite groups
  const [activeGroups, setActiveGroups] = useState<Set<SatelliteGroup>>(
    new Set(['stations', 'starlink', 'weather', 'gps', 'active'])
  );

  // Visual / display modes
  const [colorMode, setColorMode] = useState<ColorMode>('altitude');
  const [mapStyle, setMapStyle] = useState<MapStyle>('dark');
  const [projection, setProjection] = useState<ProjectionMode>('globe');

  // Selection and tracking
  const [selectedObject, setSelectedObject] = useState<SelectedObject>(null);
  const [trackedObject, setTrackedObject] = useState<SelectedObject>(null);

  // Data hooks (lifted out of Map so TopBar/SearchBar/Sidebar can share)
  const { flights, stats: flightStats } = useFlightData(showFlights, !hideOnGround);
  const { satellites, groupCounts } = useSatelliteData(showSatellites, activeGroups);
  const { radarTileUrl } = useWeatherData(showWeather);

  function handleFlightClick(f: Flight) {
    setSelectedObject({ type: 'flight', data: f });
    setTrackedObject(null);
  }

  function handleSatelliteClick(s: SatelliteInfo) {
    setSelectedObject({ type: 'satellite', data: s });
    setTrackedObject(null);
  }

  function handleAirportClick(a: Airport) {
    setSelectedObject({ type: 'airport', data: a });
    setTrackedObject(null);
  }

  function handleTrack(obj: SelectedObject) {
    setTrackedObject(obj);
  }

  function handleClosePanel() {
    setSelectedObject(null);
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black font-sans selection:bg-cyan-500/30">
      {/* 3D Globe */}
      <EarthMap
        showFlights={showFlights}
        showSatellites={showSatellites}
        showWeather={showWeather}
        showAirports={showAirports}
        showTrails={showTrails}
        showLabels={showLabels}
        colorMode={colorMode}
        mapStyle={mapStyle}
        projection={projection}
        onProjectionChange={setProjection}
        flights={flights}
        satellites={satellites}
        activeGroups={activeGroups}
        radarTileUrl={radarTileUrl}
        selectedObject={selectedObject}
        trackedObject={trackedObject}
        onFlightClick={handleFlightClick}
        onSatelliteClick={handleSatelliteClick}
        onAirportClick={handleAirportClick}
      />

      {/* Top HUD bar */}
      <TopBar
        flightStats={flightStats}
        satelliteCount={satellites.length}
      />

      {/* Search bar — centered below top bar */}
      <SearchBar
        flights={flights}
        satellites={satellites}
        onSelect={(obj) => {
          setSelectedObject(obj);
          setTrackedObject(obj);
        }}
      />

      {/* Left sidebar */}
      <Sidebar
        showFlights={showFlights}
        setShowFlights={setShowFlights}
        showSatellites={showSatellites}
        setShowSatellites={setShowSatellites}
        showWeather={showWeather}
        setShowWeather={setShowWeather}
        showAirports={showAirports}
        setShowAirports={setShowAirports}
        showTrails={showTrails}
        setShowTrails={setShowTrails}
        showLabels={showLabels}
        setShowLabels={setShowLabels}
        hideOnGround={hideOnGround}
        setHideOnGround={setHideOnGround}
        activeGroups={activeGroups}
        setActiveGroups={setActiveGroups}
        colorMode={colorMode}
        setColorMode={setColorMode}
        mapStyle={mapStyle}
        setMapStyle={setMapStyle}
        flightStats={flightStats}
        satelliteCounts={groupCounts}
      />

      {/* Right panel — selected object info */}
      <AnimatePresence>
        {selectedObject && (
          <FlightInfoPanel
            selected={selectedObject}
            onClose={handleClosePanel}
            onTrack={handleTrack}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
