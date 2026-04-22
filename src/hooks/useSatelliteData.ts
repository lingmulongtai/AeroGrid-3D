import { useState, useEffect, useRef } from 'react';
import * as satellite from 'satellite.js';

export type SatelliteGroup = 'stations' | 'starlink' | 'weather' | 'gps' | 'active';

export interface SatelliteInfo {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  altitude: number; // meters
  group: SatelliteGroup;
  orbitalPeriodMin: number;
  isISS: boolean;
}

export interface SatelliteGroupCounts {
  stations: number;
  starlink: number;
  weather: number;
  gps: number;
  active: number;
  total: number;
}

const CELESTRAK_URLS: Record<SatelliteGroup, string> = {
  stations: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
  starlink:  'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
  weather:   'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle',
  gps:       'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle',
  active:    'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle',
};

export const SATELLITE_COLORS: Record<SatelliteGroup, [number, number, number, number]> = {
  stations: [50,  255, 100, 255],  // bright green
  starlink:  [200, 220, 255, 180], // white/light blue
  weather:   [255, 160,  50, 220], // orange
  gps:       [180,  80, 255, 220], // purple
  active:    [0,   200, 255, 180], // cyan
};

export const SATELLITE_RADII: Record<SatelliteGroup, number> = {
  stations: 50000,
  starlink:  18000,
  weather:   40000,
  gps:       35000,
  active:    25000,
};

export const SATELLITE_MIN_PIXELS: Record<SatelliteGroup, number> = {
  stations: 7,
  starlink:  2,
  weather:   4,
  gps:       3,
  active:    2,
};

function parseTLE(lines: string[], group: SatelliteGroup): { name: string; line1: string; line2: string; group: SatelliteGroup }[] {
  const sats: { name: string; line1: string; line2: string; group: SatelliteGroup }[] = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i].trim();
    const l1 = lines[i + 1]?.trim();
    const l2 = lines[i + 2]?.trim();
    if (l1?.startsWith('1 ') && l2?.startsWith('2 ')) {
      sats.push({ name, line1: l1, line2: l2, group });
    }
  }
  return sats;
}

function derivePeriodMinutes(tleLine2: string): number {
  try {
    const meanMotion = parseFloat(tleLine2.substring(52, 63));
    if (isNaN(meanMotion) || meanMotion === 0) return 0;
    return 1440 / meanMotion;
  } catch {
    return 0;
  }
}

export function useSatelliteData(enabled: boolean, activeGroups: Set<SatelliteGroup>) {
  const [satellites, setSatellites] = useState<SatelliteInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupCounts, setGroupCounts] = useState<SatelliteGroupCounts>({
    stations: 0, starlink: 0, weather: 0, gps: 0, active: 0, total: 0,
  });

  const tleByGroupRef = useRef<Map<SatelliteGroup, ReturnType<typeof parseTLE>>>(new Map());
  const animFrameRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(0);

  // Fetch TLE data for all groups in parallel once
  useEffect(() => {
    if (!enabled) return;

    const fetchAll = async () => {
      setLoading(true);
      const groups = Object.keys(CELESTRAK_URLS) as SatelliteGroup[];

      const results = await Promise.allSettled(
        groups.map(group =>
          fetch(CELESTRAK_URLS[group])
            .then(r => r.ok ? r.text() : Promise.reject(`${group}: HTTP ${r.status}`))
            .then(text => ({
              group,
              lines: text.split('\n').map(l => l.trim()).filter(l => l.length > 0),
            }))
        )
      );

      results.forEach((result, i) => {
        const group = groups[i];
        if (result.status === 'fulfilled') {
          tleByGroupRef.current.set(group, parseTLE(result.value.lines, group));
        } else {
          console.warn(`Failed to fetch ${group} TLE:`, result.reason);
          // Fallback: empty array for this group
          tleByGroupRef.current.set(group, []);
        }
      });

      setLoading(false);
    };

    fetchAll();

    // Refresh TLE data every 30 minutes
    const refreshInterval = setInterval(fetchAll, 30 * 60 * 1000);
    return () => clearInterval(refreshInterval);
  }, [enabled]);

  // Propagate positions continuously at ~1fps
  useEffect(() => {
    if (!enabled) {
      setSatellites([]);
      return;
    }

    const propagate = (timestamp: number) => {
      if (timestamp - lastUpdateRef.current < 1000) {
        animFrameRef.current = requestAnimationFrame(propagate);
        return;
      }
      lastUpdateRef.current = timestamp;

      const date = new Date();
      const newSatellites: SatelliteInfo[] = [];
      const counts: SatelliteGroupCounts = { stations: 0, starlink: 0, weather: 0, gps: 0, active: 0, total: 0 };

      const groups = Object.keys(CELESTRAK_URLS) as SatelliteGroup[];

      for (const group of groups) {
        if (!activeGroups.has(group) && group !== 'stations') continue; // Always show stations (ISS)

        const tleList = tleByGroupRef.current.get(group) ?? [];
        let groupCount = 0;

        for (const { name, line1, line2 } of tleList) {
          try {
            const satrec = satellite.twoline2satrec(line1, line2);
            const pv = satellite.propagate(satrec, date);

            if (!pv.position || typeof pv.position === 'boolean') continue;

            const gmst = satellite.gstime(date);
            const gd = satellite.eciToGeodetic(pv.position, gmst);
            const lon = satellite.degreesLong(gd.longitude);
            const lat = satellite.degreesLat(gd.latitude);
            const alt = gd.height * 1000; // km → m

            if (isNaN(lon) || isNaN(lat) || isNaN(alt) || alt < 0) continue;

            const upperName = name.toUpperCase();
            const isISS = upperName.includes('ISS') || upperName.includes('ZARYA') || upperName.includes('TIANGONG') || upperName.includes('CSS');

            newSatellites.push({
              id: name,
              name,
              longitude: lon,
              latitude: lat,
              altitude: alt,
              group,
              orbitalPeriodMin: derivePeriodMinutes(line2),
              isISS,
            });
            groupCount++;
          } catch {
            // Skip invalid TLE
          }
        }

        counts[group] = groupCount;
        counts.total += groupCount;
      }

      setSatellites(newSatellites);
      setGroupCounts(counts);
      animFrameRef.current = requestAnimationFrame(propagate);
    };

    animFrameRef.current = requestAnimationFrame(propagate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [enabled, activeGroups]);

  return { satellites, loading, groupCounts };
}
