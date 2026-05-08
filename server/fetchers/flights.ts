import { broadcast } from '../ws.js';
import { saveFlightSnapshot, pruneOldData } from '../db.js';

const OPENSKY_URL        = 'https://opensky-network.org/api/states/all';
const FETCH_INTERVAL_MS  = 20_000;
const RATE_LIMIT_BACKOFF = 60_000;
const MAX_FLIGHTS        = 5_000;  // server keeps more; client can filter down
const HISTORY_LENGTH     = 10;
const SIMULATED_FLIGHTS  = 2_600;

// Server-side position history so clients get accurate trail data
const posHistory = new Map<string, [number, number, number][]>();
let simulatedFlights: ReturnType<typeof generateSimulatedFlights> | null = null;

let isRateLimited  = false;
let lastFetchAt    = 0;
let fetchCount     = 0;

function inferCategory(rawCat: number, velocity: number): string {
  if (rawCat === 1) return 'light';
  if (rawCat === 2) return 'small';
  if (rawCat === 3 || rawCat === 4) return 'medium';
  if (rawCat === 5 || rawCat === 6) return 'heavy';
  if (rawCat === 7) return 'small';
  if (rawCat === 8) return 'helicopter';
  if (velocity > 200) return 'heavy';
  if (velocity > 120) return 'large';
  if (velocity > 60)  return 'medium';
  return 'light';
}

async function fetchFlights(): Promise<void> {
  const now = Date.now();

  // Honour rate-limit backoff window
  if (isRateLimited && now - lastFetchAt < RATE_LIMIT_BACKOFF) {
    broadcastSimulatedFlights(now, true);
    return;
  }
  lastFetchAt = now;

  try {
    const res = await fetch(OPENSKY_URL, {
      headers: { 'User-Agent': 'AeroGrid-3D/1.0 (open-source visualiser)' },
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 429) {
      isRateLimited = true;
      console.warn('[flights] Rate limited — backing off 60 s');
      broadcastSimulatedFlights(now, true);
      return;
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    isRateLimited = false;
    const json = await res.json() as { states: unknown[][] };

    const flights = (json.states ?? [])
      .filter((s) => s[5] != null && s[6] != null)
      .map((s) => {
        const id  = s[0] as string;
        const lon = s[5] as number;
        const lat = s[6] as number;
        const alt = (s[13] ?? s[7] ?? 0) as number;
        const vel = (s[9]  ?? 0) as number;
        const hdg = (s[10] ?? 0) as number;
        const vr  = (s[11] ?? 0) as number;

        const prev    = posHistory.get(id) ?? [];
        const entry: [number, number, number] = [lon, lat, alt];
        const updated = [...prev, entry].slice(-HISTORY_LENGTH);
        posHistory.set(id, updated);

        return {
          id,
          callsign:        s[1] ? String(s[1]).trim() : 'N/A',
          country:         (s[2] as string) ?? 'Unknown',
          longitude:       lon,
          latitude:        lat,
          altitude:        alt,
          velocity:        vel,
          heading:         hdg,
          verticalRate:    vr,
          onGround:        Boolean(s[8]),
          category:        inferCategory((s[17] as number) ?? 0, vel),
          positionHistory: updated,
        };
      })
      .slice(0, MAX_FLIGHTS);

    console.log(`[flights] ${flights.length} aircraft from OpenSky`);
    broadcast({ type: 'flights', data: flights, rateLimited: false, simulated: false, timestamp: now }, 'flights');

    // Persist airborne flights to SQLite every 5 fetches (~100 s)
    fetchCount++;
    if (fetchCount % 5 === 0) {
      saveFlightSnapshot(flights.filter((f) => !f.onGround));
    }
    // Prune week-old rows every 150 fetches (~50 min)
    if (fetchCount % 150 === 0) {
      pruneOldData(7);
    }
  } catch (err) {
    console.error('[flights] Fetch error:', (err as Error).message);
    broadcastSimulatedFlights(now, false);
  }
}

function broadcastSimulatedFlights(now: number, rateLimited: boolean): void {
  simulatedFlights = simulatedFlights
    ? simulatedFlights.map((flight) => simulateMove(flight))
    : generateSimulatedFlights(SIMULATED_FLIGHTS);

  console.log(`[flights] ${simulatedFlights.length} simulated aircraft (${rateLimited ? 'rate limited' : 'offline fallback'})`);
  broadcast({ type: 'flights', data: simulatedFlights, rateLimited, simulated: true, timestamp: now }, 'flights');
}

function generateSimulatedFlights(count: number) {
  const routes = [
    { a: [139.78, 35.55], b: [-122.38, 37.62], weight: 0.09 },
    { a: [139.78, 35.55], b: [103.99, 1.36], weight: 0.08 },
    { a: [139.78, 35.55], b: [151.18, -33.94], weight: 0.06 },
    { a: [-0.45, 51.47], b: [-73.78, 40.64], weight: 0.10 },
    { a: [2.55, 49.00], b: [55.36, 25.25], weight: 0.08 },
    { a: [8.57, 50.04], b: [103.99, 1.36], weight: 0.07 },
    { a: [-118.41, 33.94], b: [-73.78, 40.64], weight: 0.08 },
    { a: [-87.90, 41.98], b: [-122.38, 37.62], weight: 0.06 },
    { a: [116.58, 40.08], b: [121.80, 31.15], weight: 0.08 },
    { a: [72.87, 19.09], b: [55.36, 25.25], weight: 0.06 },
  ] as const;

  const categories = ['heavy', 'large', 'medium', 'small', 'light', 'helicopter'] as const;

  return Array.from({ length: count }, (_, i) => {
    const route = weightedRoute(routes);
    const t = Math.random();
    const jitterLon = (Math.random() - 0.5) * 8;
    const jitterLat = (Math.random() - 0.5) * 4;
    const lon = normalizeLon(lerp(route.a[0], route.b[0], t) + jitterLon);
    const lat = Math.max(-82, Math.min(82, lerp(route.a[1], route.b[1], t) + jitterLat));
    const heading = bearingBetween(route.a[0], route.a[1], route.b[0], route.b[1]) + (Math.random() - 0.5) * 18;
    const category = categories[Math.floor(Math.random() * categories.length)];
    const onGround = Math.random() < 0.035;
    const altitude = onGround ? 0 : 6_000 + Math.random() * 7_500;
    const velocity = category === 'helicopter'
      ? 42 + Math.random() * 38
      : onGround ? 0 : 150 + Math.random() * 135;

    return {
      id: `sim-${i}`,
      callsign: `AG${String(1000 + i).slice(-4)}`,
      country: 'Simulation',
      longitude: lon,
      latitude: lat,
      altitude,
      velocity,
      heading: normalizeHeading(heading),
      verticalRate: onGround ? 0 : (Math.random() - 0.5) * 6,
      onGround,
      category,
      positionHistory: [[lon, lat, altitude] as [number, number, number]],
    };
  });
}

function simulateMove<T extends {
  longitude: number;
  latitude: number;
  altitude: number;
  velocity: number;
  heading: number;
  verticalRate: number;
  onGround: boolean;
  positionHistory: [number, number, number][];
}>(flight: T): T {
  if (flight.onGround) return flight;

  const stepSeconds = FETCH_INTERVAL_MS / 1000;
  const distanceMeters = flight.velocity * stepSeconds;
  const headingRad = (flight.heading * Math.PI) / 180;
  const latRad = (flight.latitude * Math.PI) / 180;
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = Math.max(12_000, metersPerDegreeLat * Math.cos(latRad));
  const longitude = normalizeLon(flight.longitude + (Math.sin(headingRad) * distanceMeters) / metersPerDegreeLon);
  const latitude = Math.max(-82, Math.min(82, flight.latitude + (Math.cos(headingRad) * distanceMeters) / metersPerDegreeLat));
  const altitude = Math.max(500, Math.min(13_500, flight.altitude + flight.verticalRate * stepSeconds));
  const position: [number, number, number] = [longitude, latitude, altitude];

  return {
    ...flight,
    longitude,
    latitude,
    altitude,
    heading: normalizeHeading(flight.heading + (Math.random() - 0.5) * 3),
    verticalRate: Math.max(-8, Math.min(8, flight.verticalRate + (Math.random() - 0.5) * 0.8)),
    positionHistory: [...flight.positionHistory, position].slice(-HISTORY_LENGTH),
  };
}

function weightedRoute<T extends { weight: number }>(routes: readonly T[]): T {
  const total = routes.reduce((sum, route) => sum + route.weight, 0);
  let r = Math.random() * total;
  for (const route of routes) {
    r -= route.weight;
    if (r <= 0) return route;
  }
  return routes[0];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function normalizeHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function bearingBetween(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const lambda1 = (lon1 * Math.PI) / 180;
  const lambda2 = (lon2 * Math.PI) / 180;
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2)
    - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  return normalizeHeading((Math.atan2(y, x) * 180) / Math.PI);
}

export function startFlightFetcher(): void {
  fetchFlights();
  setInterval(fetchFlights, FETCH_INTERVAL_MS);
  console.log(`[flights] Fetcher started (interval ${FETCH_INTERVAL_MS / 1000} s)`);
}
