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

export function useFlightData(enabled: boolean, showOnGround: boolean = false) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [stats, setStats] = useState<FlightStats>({ total: 0, airborne: 0, avgAltitude: 0, avgSpeed: 0, isLive: false, isRateLimited: false });
  const historyRef = useRef<Map<string, [number, number, number][]>>(new Map());
  const isRateLimitedRef = useRef(false);
  const lastFetchRef = useRef(0);

  const fetchFlights = useCallback(async () => {
    if (!enabled) return;

    // Honor rate-limit backoff
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
          // Prefer geometric altitude (s[13]), fall back to barometric (s[7])
          const alt: number = (s[13] != null ? s[13] : (s[7] ?? 0));
          const vel: number = s[9] ?? 0;
          const hdg: number = s[10] ?? 0;
          const vr: number = s[11] ?? 0;
          const rawCat: number = s[17] ?? 0;
          const category: AircraftCategory = rawCat > 0 ? mapAircraftCategory(rawCat) : inferCategoryFromVelocity(vel);

          // Update position history
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

      setFlights(filtered);

      const airborne = filtered.filter(f => !f.onGround && f.altitude > 0);
      const avgAlt = airborne.length > 0 ? airborne.reduce((a, b) => a + b.altitude, 0) / airborne.length : 0;
      const avgSpd = airborne.length > 0 ? airborne.reduce((a, b) => a + b.velocity, 0) / airborne.length : 0;

      setStats({ total: filtered.length, airborne: airborne.length, avgAltitude: avgAlt, avgSpeed: avgSpd, isLive: true, isRateLimited: false });
    } catch {
      // Fallback to simulated data
      setStats(s => ({ ...s, isLive: false }));
      setFlights(prev => {
        if (prev.length === 0) {
          return generateSimulatedFlights();
        }
        return prev.map(f => simulateMove(f));
      });
    }
  }, [enabled, showOnGround]);

  useEffect(() => {
    if (!enabled) {
      setFlights([]);
      setStats({ total: 0, airborne: 0, avgAltitude: 0, avgSpeed: 0, isLive: false, isRateLimited: false });
      return;
    }

    fetchFlights();
    const interval = window.setInterval(fetchFlights, FETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, fetchFlights]);

  return { flights, stats };
}

function generateSimulatedFlights(): Flight[] {
  return Array.from({ length: 800 }, (_, i) => {
    const heading = Math.random() * 360;
    const lon = (Math.random() - 0.5) * 360;
    const lat = (Math.random() - 0.5) * 160;
    const alt = 7000 + Math.random() * 6000;
    const cats: AircraftCategory[] = ['heavy', 'large', 'medium', 'small', 'light'];
    const category = cats[Math.floor(Math.random() * cats.length)];
    return {
      id: `sim-${i}`,
      callsign: `SIM${String(i).padStart(4, '0')}`,
      country: 'Simulation',
      longitude: lon,
      latitude: lat,
      altitude: alt,
      velocity: 150 + Math.random() * 150,
      heading,
      verticalRate: (Math.random() - 0.5) * 4,
      onGround: false,
      category,
      positionHistory: [[lon, lat, alt]],
    };
  });
}

function simulateMove(f: Flight): Flight {
  const rad = ((90 - f.heading) * Math.PI) / 180;
  const speed = f.velocity / 800000; // rough degree-per-tick
  const lon = ((f.longitude + Math.cos(rad) * speed + 180) % 360) - 180;
  const lat = Math.max(-85, Math.min(85, f.latitude + Math.sin(rad) * speed));
  const alt = f.altitude + f.verticalRate * (FETCH_INTERVAL_MS / 1000);
  const pos: [number, number, number] = [lon, lat, alt];
  return {
    ...f,
    longitude: lon,
    latitude: lat,
    altitude: Math.max(0, alt),
    positionHistory: [...f.positionHistory, pos].slice(-HISTORY_LENGTH),
  };
}
