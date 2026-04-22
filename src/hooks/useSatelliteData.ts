import { useState, useEffect } from 'react';
import * as satellite from 'satellite.js';

export interface SatelliteInfo {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  altitude: number; // meters
}

export function useSatelliteData(enabled: boolean) {
  const [satellites, setSatellites] = useState<SatelliteInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [tleData, setTleData] = useState<string[] | null>(null);

  // Fetch TLE data once
  useEffect(() => {
    if (!enabled) return;

    const fetchTLE = async () => {
      try {
        setLoading(true);
        const res = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle');
        if (!res.ok) throw new Error('CelesTrak fetch failed');
        const text = await res.text();
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        setTleData(lines);
      } catch (err) {
        console.warn("Failed to fetch satellite data, using simulation", err);
        // Fallback: Generate some static "simulated" satellites if fetch fails
        const mockSats = Array.from({length: 30}).map((_, i) => ({
          id: `sim-sat-${i}`,
          name: `SIM-SAT [${1000 + i}]`,
          longitude: Math.random() * 360 - 180,
          latitude: Math.random() * 160 - 80,
          altitude: 400000 + Math.random() * 200000 // 400-600km ISS height
        }));
        setSatellites(mockSats);
      } finally {
        setLoading(false);
      }
    };

    fetchTLE();
  }, [enabled]);

  // Update positions continuously based on TLE
  useEffect(() => {
    if (!enabled || !tleData) {
      setSatellites([]);
      return;
    }

    let animationFrameId: number;
    let lastUpdate = 0;

    const updatePositions = (timestamp: number) => {
      // Limit updates to roughly 1 fps for satellites to save CPU, they move fast but not that fast visually
      if (timestamp - lastUpdate < 1000) {
        animationFrameId = requestAnimationFrame(updatePositions);
        return;
      }
      lastUpdate = timestamp;

      const date = new Date();
      const newSatellites: SatelliteInfo[] = [];

      // TLE data is 3 lines per satellite: Name, Line1, Line2
      for (let i = 0; i < tleData.length; i += 3) {
        const name = tleData[i];
        const tleLine1 = tleData[i + 1];
        const tleLine2 = tleData[i + 2];

        if (!tleLine1 || !tleLine2) continue;

        try {
          const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
          const positionAndVelocity = satellite.propagate(satrec, date);
          
          if (positionAndVelocity.position && typeof positionAndVelocity.position !== 'boolean') {
            const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, satellite.gstime(date));
            const longitude = satellite.degreesLong(positionGd.longitude);
            const latitude = satellite.degreesLat(positionGd.latitude);
            // altitude in satelliteGd is in km, we need meters
            const altitude = positionGd.height * 1000;

            if (!isNaN(longitude) && !isNaN(latitude) && !isNaN(altitude)) {
              newSatellites.push({
                id: name,
                name: name,
                longitude,
                latitude,
                altitude
              });
            }
          }
        } catch (e) {
          // Ignore invalid TLE or propagation errors 
        }
      }

      setSatellites(newSatellites);
      animationFrameId = requestAnimationFrame(updatePositions);
    };

    animationFrameId = requestAnimationFrame(updatePositions);

    return () => cancelAnimationFrame(animationFrameId);
  }, [enabled, tleData]);

  return { satellites, loading };
}
