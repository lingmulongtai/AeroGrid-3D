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


function seededRandom(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function buildDemoSatelliteCounts(satellites: SatelliteInfo[]): SatelliteGroupCounts {
  const counts: SatelliteGroupCounts = { stations: 0, starlink: 0, weather: 0, gps: 0, active: 0, total: satellites.length };
  satellites.forEach((sat) => { counts[sat.group]++; });
  return counts;
}

function generateDemoSatellites(activeGroups: Set<SatelliteGroup>, date = new Date()): SatelliteInfo[] {
  const groups: { group: SatelliteGroup; count: number; altitude: number; inclination: number; period: number }[] = [
    { group: 'stations', count: 3, altitude: 420000, inclination: 51.6, period: 92.7 },
    { group: 'starlink', count: activeGroups.has('starlink') ? 720 : 0, altitude: 550000, inclination: 53, period: 95.0 },
    { group: 'weather', count: activeGroups.has('weather') ? 72 : 0, altitude: 820000, inclination: 98.7, period: 101.2 },
    { group: 'gps', count: activeGroups.has('gps') ? 31 : 0, altitude: 20200000, inclination: 55, period: 718 },
    { group: 'active', count: activeGroups.has('active') ? 380 : 0, altitude: 1200000, inclination: 74, period: 109 },
  ];
  const minutes = date.getTime() / 60000;
  const satellites: SatelliteInfo[] = [];

  groups.forEach(({ group, count, altitude, inclination, period }) => {
    const random = seededRandom(3000 + group.length * 997);
    for (let i = 0; i < count; i++) {
      const raan = random() * 360;
      const phase = ((minutes / period) * 360 + random() * 360 + i * (360 / Math.max(1, count))) % 360;
      const lat = Math.sin((phase * Math.PI) / 180) * inclination;
      const lon = ((raan + phase * (group === 'gps' ? 0.42 : 1.35) + 540) % 360) - 180;
      satellites.push({
        id: `demo-${group}-${i}`,
        name: group === 'stations' ? ['ISS (ZARYA)', 'CSS (TIANGONG)', 'CREW DRAGON'][i] : `${group.toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
        longitude: lon,
        latitude: Math.max(-84, Math.min(84, lat + (random() - 0.5) * 2.5)),
        altitude: altitude + (random() - 0.5) * altitude * 0.04,
        group,
        orbitalPeriodMin: period,
        isISS: group === 'stations' && i === 0,
      });
    }
  });

  return satellites;
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
  const initialDemoRef = useRef<SatelliteInfo[]>(enabled ? generateDemoSatellites(activeGroups) : []);
  const [satellites, setSatellites] = useState<SatelliteInfo[]>(() => initialDemoRef.current);
  const [loading, setLoading] = useState(false);
  const [groupCounts, setGroupCounts] = useState<SatelliteGroupCounts>(() => buildDemoSatelliteCounts(initialDemoRef.current));

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
      const hasAnyTle = groups.some((group) => (tleByGroupRef.current.get(group)?.length ?? 0) > 0);
      if (!hasAnyTle) {
        const demo = generateDemoSatellites(activeGroups, date);
        setSatellites(demo);
        setGroupCounts(buildDemoSatelliteCounts(demo));
        animFrameRef.current = requestAnimationFrame(propagate);
        return;
      }

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
