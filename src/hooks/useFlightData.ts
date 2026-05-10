import { useState, useEffect, useRef, useCallback } from 'react';
import { AircraftCategory, mapAircraftCategory, inferCategoryFromVelocity } from '../utils/flightUtils';

export interface Flight {
  id: string;
  callsign: string;
  country: string;
  longitude: number;
  latitude: number;
  altitude: number; // meters
  velocity: number; // m/s
  heading: number; // degrees true track
  verticalRate: number; // m/s (positive = climbing)
  onGround: boolean;
  category: AircraftCategory;
  positionHistory: [number, number, number][]; // [lon, lat, alt][]
}

export interface FlightStats {
  total: number;
  airborne: number;
  avgAltitude: number;
  avgSpeed: number;
  isLive: boolean;
  isRateLimited: boolean;
}

const MAX_FLIGHTS = 3000;
const HISTORY_LENGTH = 10;
const FETCH_INTERVAL_MS = 20000;
const RATE_LIMIT_BACKOFF_MS = 60000;
const DEMO_FLIGHT_COUNT = 2200;

type AirportSeed = [code: string, country: string, lon: number, lat: number];

const HUBS: AirportSeed[] = [
  ['HND', 'Japan', 139.78, 35.55], ['NRT', 'Japan', 140.39, 35.77], ['ICN', 'South Korea', 126.45, 37.46],
  ['PEK', 'China', 116.58, 40.08], ['SIN', 'Singapore', 103.99, 1.36], ['BKK', 'Thailand', 100.75, 13.69],
  ['SYD', 'Australia', 151.18, -33.95], ['DXB', 'United Arab Emirates', 55.36, 25.25], ['DOH', 'Qatar', 51.61, 25.27],
  ['LHR', 'United Kingdom', -0.45, 51.47], ['CDG', 'France', 2.55, 49.01], ['FRA', 'Germany', 8.57, 50.04],
  ['AMS', 'Netherlands', 4.76, 52.31], ['JFK', 'United States', -73.78, 40.64], ['EWR', 'United States', -74.17, 40.69],
  ['ATL', 'United States', -84.43, 33.64], ['ORD', 'United States', -87.91, 41.98], ['DFW', 'United States', -97.04, 32.90],
  ['LAX', 'United States', -118.41, 33.94], ['SFO', 'United States', -122.38, 37.62], ['SEA', 'United States', -122.31, 47.45],
  ['YVR', 'Canada', -123.18, 49.19], ['YYZ', 'Canada', -79.63, 43.68], ['MEX', 'Mexico', -99.07, 19.44],
  ['GRU', 'Brazil', -46.47, -23.43], ['BOG', 'Colombia', -74.15, 4.70], ['SCL', 'Chile', -70.79, -33.39],
  ['JNB', 'South Africa', 28.25, -26.13], ['ADD', 'Ethiopia', 38.80, 8.98], ['IST', 'Turkey', 28.75, 41.26],
];

const ROUTES: [number, number][] = [
  [0, 13], [0, 18], [0, 9], [0, 5], [1, 14], [1, 19], [2, 18], [2, 20], [3, 11], [3, 7],
  [4, 7], [4, 18], [5, 6], [6, 18], [7, 9], [7, 13], [8, 10], [9, 13], [9, 18], [10, 14],
  [11, 16], [12, 13], [13, 15], [13, 18], [14, 20], [15, 17], [16, 18], [18, 19], [19, 20], [20, 21],
  [21, 13], [22, 15], [23, 24], [24, 25], [25, 26], [26, 18], [27, 8], [28, 7], [29, 11], [29, 2],
];

const AIRLINES = ['JAL', 'ANA', 'UAL', 'DAL', 'AAL', 'BAW', 'AFR', 'DLH', 'KLM', 'SIA', 'UAE', 'QTR', 'KAL', 'CPA'];
const CATEGORIES: AircraftCategory[] = ['heavy', 'large', 'medium', 'small', 'light'];

function seededRandom(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function wrapLon(lon: number): number {
  return ((lon + 540) % 360) - 180;
}

function toRad(deg: number): number { return deg * Math.PI / 180; }
function toDeg(rad: number): number { return rad * 180 / Math.PI; }

function distanceKm(a: AirportSeed, b: AirportSeed): number {
  const r = 6371;
  const dLat = toRad(b[3] - a[3]);
  const dLon = toRad(b[2] - a[2]);
  const lat1 = toRad(a[3]);
  const lat2 = toRad(b[3]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function interpolateRoute(a: AirportSeed, b: AirportSeed, t: number): [number, number] {
  const lat1 = toRad(a[3]);
  const lon1 = toRad(a[2]);
  const lat2 = toRad(b[3]);
  const lon2 = toRad(b[2]);
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
  ));

  if (d < 1e-6) return [a[2], a[3]];

  const aa = Math.sin((1 - t) * d) / Math.sin(d);
  const bb = Math.sin(t * d) / Math.sin(d);
  const x = aa * Math.cos(lat1) * Math.cos(lon1) + bb * Math.cos(lat2) * Math.cos(lon2);
  const y = aa * Math.cos(lat1) * Math.sin(lon1) + bb * Math.cos(lat2) * Math.sin(lon2);
  const z = aa * Math.sin(lat1) + bb * Math.sin(lat2);
  return [wrapLon(toDeg(Math.atan2(y, x))), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))];
}

function bearingBetween(from: [number, number], to: [number, number]): number {
  const lat1 = toRad(from[1]);
  const lat2 = toRad(to[1]);
  const dLon = toRad(to[0] - from[0]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function categoryForDistance(distance: number, rnd: number): AircraftCategory {
  if (distance > 6500) return rnd > 0.28 ? 'heavy' : 'large';
  if (distance > 2500) return rnd > 0.45 ? 'large' : 'medium';
  return CATEGORIES[Math.min(CATEGORIES.length - 1, Math.floor(rnd * CATEGORIES.length))];
}

function makeFlight(index: number, nowMs: number): Flight {
  const random = seededRandom(9001 + index * 7919);
  const [fromIndex, toIndex] = ROUTES[index % ROUTES.length];
  const reverse = random() > 0.5;
  const from = HUBS[reverse ? toIndex : fromIndex];
  const to = HUBS[reverse ? fromIndex : toIndex];
  const distance = distanceKm(from, to);
  const routeMinutes = Math.max(45, distance / (12.4 + random() * 2.1));
  const phaseOffset = random();
  const t = ((nowMs / 60000 / routeMinutes) + phaseOffset) % 1;
  const nextT = Math.min(0.999, t + 0.004);
  const position = interpolateRoute(from, to, t);
  const nextPosition = interpolateRoute(from, to, nextT);
  const category = categoryForDistance(distance, random());
  const cruiseAlt = (category === 'heavy' || category === 'large' ? 10300 : category === 'medium' ? 9400 : 6100) + random() * 1700;
  const climb = Math.min(1, t / 0.12);
  const descent = Math.min(1, (1 - t) / 0.16);
  const altitude = Math.max(700, cruiseAlt * Math.min(climb, descent) + (random() - 0.5) * 300);
  const verticalRate = t < 0.12 ? 7 + random() * 5 : t > 0.84 ? -(6 + random() * 5) : (random() - 0.5) * 0.8;
  const velocity = (category === 'heavy' || category === 'large' ? 235 : category === 'medium' ? 215 : 145) + (random() - 0.5) * 28;
  const airline = AIRLINES[index % AIRLINES.length];
  const callsign = `${airline}${String(100 + (index * 37) % 8900)}`;
  const history = Array.from({ length: HISTORY_LENGTH }, (_, h): [number, number, number] => {
    const ht = Math.max(0, t - (HISTORY_LENGTH - h) * 0.0028);
    const [lon, lat] = interpolateRoute(from, to, ht);
    return [lon, lat, altitude - (HISTORY_LENGTH - h) * verticalRate * 8];
  });

  return {
    id: `demo-${from[0]}-${to[0]}-${index}`,
    callsign,
    country: from[1],
    longitude: position[0],
    latitude: position[1],
    altitude,
    velocity,
    heading: bearingBetween(position, nextPosition),
    verticalRate,
    onGround: false,
    category,
    positionHistory: history,
  };
}

export function generateRealisticDemoFlights(count = DEMO_FLIGHT_COUNT, nowMs = Date.now()): Flight[] {
  return Array.from({ length: count }, (_, index) => makeFlight(index, nowMs));
}

export function calculateFlightStats(flights: Flight[], isLive: boolean, isRateLimited = false): FlightStats {
  const airborne = flights.filter((f) => !f.onGround && f.altitude > 0);
  return {
    total: flights.length,
    airborne: airborne.length,
    avgAltitude: airborne.length ? airborne.reduce((a, b) => a + b.altitude, 0) / airborne.length : 0,
    avgSpeed: airborne.length ? airborne.reduce((a, b) => a + b.velocity, 0) / airborne.length : 0,
    isLive,
    isRateLimited,
  };
}

function simulateMove(f: Flight): Flight {
  const distanceMeters = f.velocity * (FETCH_INTERVAL_MS / 1000);
  const angularDistance = distanceMeters / 6371000;
  const bearing = toRad(f.heading);
  const lat1 = toRad(f.latitude);
  const lon1 = toRad(f.longitude);

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  );
  const lon = wrapLon(toDeg(lon2));
  const lat = Math.max(-85, Math.min(85, toDeg(lat2)));
  const alt = Math.max(600, f.altitude + f.verticalRate * (FETCH_INTERVAL_MS / 1000));
  const pos: [number, number, number] = [lon, lat, alt];
  return {
    ...f,
    longitude: lon,
    latitude: lat,
    altitude: alt,
    heading: (f.heading + (Math.sin(lon * 0.1) * 0.3)) % 360,
    positionHistory: [...f.positionHistory, pos].slice(-HISTORY_LENGTH),
  };
}

export function useFlightData(enabled: boolean, showOnGround: boolean = false) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [stats, setStats] = useState<FlightStats>({ total: 0, airborne: 0, avgAltitude: 0, avgSpeed: 0, isLive: false, isRateLimited: false });
  const historyRef = useRef<Map<string, [number, number, number][]>>(new Map());
  const isRateLimitedRef = useRef(false);
  const lastFetchRef = useRef(0);

  const fetchFlights = useCallback(async () => {
    if (!enabled) return;

    const now = Date.now();
    if (isRateLimitedRef.current && now - lastFetchRef.current < RATE_LIMIT_BACKOFF_MS) return;
    lastFetchRef.current = now;

    try {
      const res = await fetch('https://opensky-network.org/api/states/all');

      if (res.status === 429) {
        isRateLimitedRef.current = true;
        setStats(s => ({ ...s, isRateLimited: true, isLive: false }));
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      isRateLimitedRef.current = false;
      const data = await res.json();
      const history = historyRef.current;

      const mapped: Flight[] = data.states
        .filter((s: any[]) => s[5] != null && s[6] != null)
        .map((s: any[]): Flight => {
          const id: string = s[0];
          const lon: number = s[5];
          const lat: number = s[6];
          const alt: number = (s[13] != null ? s[13] : (s[7] ?? 0));
          const vel: number = s[9] ?? 0;
          const hdg: number = s[10] ?? 0;
          const vr: number = s[11] ?? 0;
          const rawCat: number = s[17] ?? 0;
          const category: AircraftCategory = rawCat > 0 ? mapAircraftCategory(rawCat) : inferCategoryFromVelocity(vel);
          const prev = history.get(id) ?? [];
          const entry: [number, number, number] = [lon, lat, alt];
          const updated = [...prev, entry].slice(-HISTORY_LENGTH);
          history.set(id, updated);

          return {
            id,
            callsign: s[1] ? String(s[1]).trim() : 'N/A',
            country: s[2] ?? 'Unknown',
            longitude: lon,
            latitude: lat,
            altitude: alt,
            velocity: vel,
            heading: hdg,
            verticalRate: vr,
            onGround: Boolean(s[8]),
            category,
            positionHistory: updated,
          };
        });

      const filtered = (showOnGround ? mapped : mapped.filter(f => !f.onGround && f.altitude > 0))
        .slice(0, MAX_FLIGHTS);
      const nextFlights = filtered.length > 0 ? filtered : generateRealisticDemoFlights();

      setFlights(nextFlights);
      setStats(calculateFlightStats(nextFlights, filtered.length > 0, false));
    } catch {
      setFlights(prev => {
        const next = prev.length === 0 ? generateRealisticDemoFlights() : prev.map(f => simulateMove(f));
        setStats(calculateFlightStats(next, false, isRateLimitedRef.current));
        return next;
      });
    }
  }, [enabled, showOnGround]);

  useEffect(() => {
    if (!enabled) {
      setFlights([]);
      setStats({ total: 0, airborne: 0, avgAltitude: 0, avgSpeed: 0, isLive: false, isRateLimited: false });
      return;
    }

    const demo = generateRealisticDemoFlights();
    setFlights(demo);
    setStats(calculateFlightStats(demo, false));
    fetchFlights();
    const interval = window.setInterval(fetchFlights, FETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, fetchFlights]);

  return { flights, stats };
}
