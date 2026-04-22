import React, { useState } from 'react';
import EarthMap from './components/Map';
import { Sidebar } from './components/Sidebar';

export default function App() {
  const [showFlights, setShowFlights] = useState(true);
  const [showSatellites, setShowSatellites] = useState(true);
  const [showWeather, setShowWeather] = useState(true);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black font-sans selection:bg-cyan-500/30">
      <EarthMap 
        showFlights={showFlights}
        showSatellites={showSatellites}
        showWeather={showWeather}
      />
      <Sidebar 
        showFlights={showFlights}
        setShowFlights={setShowFlights}
        showSatellites={showSatellites}
        setShowSatellites={setShowSatellites}
        showWeather={showWeather}
        setShowWeather={setShowWeather}
      />
    </div>
  );
}
