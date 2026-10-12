import type { FlightCategory, FlightRecord } from '../../shared/contracts';
import { MAJOR_AIRPORTS, type Airport } from '../data/airports';

export type Flight = FlightRecord;

export interface FlightStats {
  total: number;
  airborne: number;
  avgAltitude: number;
  avgSpeed: number;
  isLive: boolean;
  isRateLimited: boolean;
}

const HISTORY_LENGTH = 10;
const DEMO_FLIGHT_COUNT = 2200;
const EARTH_RADIUS_KM = 6371;

// Busy hubs get more departures so traffic density resembles real airspace.
const HUB_WEIGHT: Record<string, number> = Object.fromEntries([
  ...['ATL', 'DXB', 'DFW', 'LHR', 'HND', 'DEN', 'IST', 'LAX', 'ORD', 'DEL', 'CDG', 'JFK', 'CAN', 'AMS', 'FRA', 'SIN', 'ICN', 'PVG', 'PEK', 'MAD'].map((code) => [code, 9]),
  ...['BCN', 'SFO', 'LAS', 'SEA', 'MIA', 'CLT', 'PHX', 'MCO', 'EWR', 'IAH', 'BKK', 'KUL', 'DOH', 'SYD', 'MEX', 'GRU', 'YYZ', 'CGK', 'MUC', 'FCO', 'HKG', 'TPE', 'NRT', 'BOM', 'SVO', 'JED', 'RUH', 'MNL', 'CTU', 'SZX', 'KMG', 'BOG', 'LIM', 'SCL', 'JNB', 'ADD', 'CAI', 'NBO', 'LGW', 'ZRH', 'VIE', 'CPH', 'OSL', 'ARN', 'HEL', 'DUB', 'LIS', 'ATH', 'MEL', 'BNE', 'AKL', 'YVR', 'YUL', 'BOS', 'MSP', 'DTW', 'PHL', 'SLC', 'SAN', 'KIX', 'FUK', 'CTS', 'OKA', 'XIY', 'HGH', 'WUH', 'CKG', 'SGN', 'HAN', 'BLR', 'MAA', 'HYD', 'CCU', 'AUH', 'BAH', 'MCT', 'KWI', 'CMN', 'LOS', 'ACC', 'GIG', 'EZE', 'PTY', 'CUN'].map((code) => [code, 4]),
]);

const AIRLINES_BY_COUNTRY: Record<string, string[]> = {
  JP: ['JAL', 'ANA', 'SKY', 'APJ'], US: ['UAL', 'DAL', 'AAL', 'SWA', 'ASA', 'JBU'], CN: ['CCA', 'CES', 'CSN', 'CHH'],
  GB: ['BAW', 'EZY', 'VIR'], FR: ['AFR'], DE: ['DLH', 'EWG'], NL: ['KLM'], AE: ['UAE', 'ETD'], QA: ['QTR'],
  SG: ['SIA'], KR: ['KAL', 'AAR'], HK: ['CPX'], TW: ['EVA', 'CAL'], AU: ['QFA', 'VOZ'], CA: ['ACA', 'WJA'],
  TR: ['THY'], IN: ['AIC', 'IGO'], BR: ['TAM', 'GLO'], ES: ['IBE', 'VLG'], IT: ['ITY'], TH: ['THA'],
  MY: ['MAS'], ID: ['GIA'], RU: ['AFL'], MX: ['AMX'], SA: ['SVA'], ET: ['ETH'], ZA: ['SAA'], IE: ['RYR', 'EIN'],
};
const GLOBAL_AIRLINES = ['UAL', 'DLH', 'UAE', 'QTR', 'AFR', 'KLM', 'BAW', 'SIA', 'THY', 'CPA'];

const TYPES: Record<FlightCategory, string[]> = {
  heavy: ['B77W', 'A388', 'B748', 'A35K', 'B789'],
  large: ['A359', 'B788', 'A333', 'B763', 'A339'],
  medium: ['A320', 'B738', 'A21N', 'B38M', 'A20N'],
  small: ['E190', 'CRJ9', 'E175', 'AT76', 'DH8D'],
  light: ['C172', 'PA28', 'SR22', 'C208'],
  rotorcraft: ['EC35', 'AS50', 'R44', 'B429'],
  high_performance: ['GLF6', 'C68A', 'CL60'],
};

function seededRandom(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function toRad(deg: number): number { return deg * Math.PI / 180; }
function toDeg(rad: number): number { return rad * 180 / Math.PI; }
function wrapLon(lon: number): number { return ((((lon + 180) % 360) + 360) % 360) - 180; }

function distanceKm(a: Airport, b: Airport): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function interpolateRoute(a: Airport, b: Airport, t: number): [number, number] {
  const lat1 = toRad(a.latitude);
  const lon1 = toRad(a.longitude);
  const lat2 = toRad(b.latitude);
  const lon2 = toRad(b.longitude);
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
  ));
  if (d < 1e-6) return [a.longitude, a.latitude];
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

interface Route {
  from: Airport;
  to: Airport;
  distance: number;
  kind: 'airline' | 'local';
}

let routeCache: Route[] | null = null;

function buildRoutes(): Route[] {
  if (routeCache) return routeCache;
  const random = seededRandom(20_260_101);
  const weighted: Airport[] = [];
  for (const airport of MAJOR_AIRPORTS) {
    const weight = HUB_WEIGHT[airport.iata] ?? 1;
    for (let i = 0; i < weight; i++) weighted.push(airport);
  }
  const pick = () => weighted[Math.floor(random() * weighted.length)];
  const routes: Route[] = [];
  let guard = 0;
  while (routes.length < 1400 && guard++ < 200_000) {
    const from = pick();
    const to = pick();
    if (from.iata === to.iata) continue;
    const distance = distanceKm(from, to);
    if (distance < 280 || distance > 15_500) continue;
    const accept = Math.exp(-distance / 3200) + 0.12;
    if (random() > accept) continue;
    routes.push({ from, to, distance, kind: 'airline' });
  }
  routeCache = routes;
  return routes;
}

function categoryForDistance(distance: number, rnd: number): FlightCategory {
  if (distance > 7000) return rnd > 0.35 ? 'heavy' : 'large';
  if (distance > 3500) return rnd > 0.55 ? 'large' : 'medium';
  if (distance > 900) return rnd > 0.18 ? 'medium' : 'small';
  return rnd > 0.45 ? 'medium' : 'small';
}

function makeLocalFlight(index: number, nowMs: number, random: () => number): Flight {
  const base = MAJOR_AIRPORTS[Math.floor(random() * MAJOR_AIRPORTS.length)];
  const rotor = random() > 0.55;
  const category: FlightCategory = rotor ? 'rotorcraft' : 'light';
  const radiusKm = rotor ? 12 + random() * 30 : 25 + random() * 70;
  const periodMs = (2 * Math.PI * radiusKm / (rotor ? 0.065 : 0.06)) * 1000;
  const angle = random() * Math.PI * 2 + (nowMs / periodMs) * Math.PI * 2;
  const centerLat = base.latitude + (random() - 0.5) * 0.4;
  const centerLon = base.longitude + (random() - 0.5) * 0.4;
  const position = (a: number): [number, number] => [
    wrapLon(centerLon + (Math.cos(a) * radiusKm) / (111.32 * Math.cos(toRad(centerLat)))),
    centerLat + (Math.sin(a) * radiusKm) / 110.57,
  ];
  const current = position(angle);
  const next = position(angle + 0.01);
  const altitude = rotor ? 250 + random() * 600 : 900 + random() * 2200;
  const types = TYPES[category];
  const history = Array.from({ length: HISTORY_LENGTH }, (_, h): [number, number, number] => {
    const p = position(angle - (HISTORY_LENGTH - h) * 0.06);
    return [p[0], p[1], altitude];
  });
  return {
    id: `demo-local-${base.iata}-${index}`,
    callsign: `${rotor ? 'HEMS' : 'N'}${String(100 + (index * 53) % 899)}${rotor ? '' : 'GA'}`,
    registration: `${rotor ? 'H' : 'N'}-${(index * 7919 % 46656).toString(36).toUpperCase().padStart(3, 'X')}`,
    aircraftType: types[index % types.length],
    country: base.country,
    longitude: current[0],
    latitude: current[1],
    altitude,
    velocity: rotor ? 60 + random() * 20 : 55 + random() * 25,
    heading: bearingBetween(current, next),
    verticalRate: (random() - 0.5) * 2,
    onGround: false,
    category,
    lastSeenSeconds: 0,
    positionHistory: history,
  };
}

function makeFlight(index: number, nowMs: number): Flight {
  const random = seededRandom(9001 + index * 7919);
  if (index % 23 === 7) return makeLocalFlight(index, nowMs, random);
  const routes = buildRoutes();
  const route = routes[Math.floor(random() * routes.length)];
  const reverse = random() > 0.5;
  const from = reverse ? route.to : route.from;
  const to = reverse ? route.from : route.to;
  const category = categoryForDistance(route.distance, random());
  const cruiseSpeed = category === 'heavy' || category === 'large' ? 245 : category === 'medium' ? 225 : 175;
  const routeMinutes = Math.max(40, route.distance / (cruiseSpeed * 0.06) + 25);
  const phaseOffset = random();
  const t = ((nowMs / 60000 / routeMinutes) + phaseOffset) % 1;
  const nextT = Math.min(0.9999, t + 0.002);
  const position = interpolateRoute(from, to, t);
  const nextPosition = interpolateRoute(from, to, nextT);
  const cruiseAlt = (category === 'heavy' || category === 'large' ? 10_700 : category === 'medium' ? 10_000 : 7_600) + Math.floor(random() * 5) * 300;
  const climbFraction = Math.min(0.3, 180 / route.distance);
  const climb = Math.min(1, t / climbFraction);
  const descent = Math.min(1, (1 - t) / (climbFraction * 1.25));
  const profile = Math.min(climb, descent);
  const altitude = Math.max(400, cruiseAlt * Math.sin(profile * Math.PI / 2));
  const verticalRate = climb < 1 ? 7 + random() * 6 : descent < 1 ? -(5 + random() * 5) : (random() - 0.5) * 0.6;
  const velocity = cruiseSpeed * (0.55 + 0.45 * Math.min(1, profile * 1.6)) + (random() - 0.5) * 18;
  const pool = AIRLINES_BY_COUNTRY[from.country] ?? AIRLINES_BY_COUNTRY[to.country] ?? GLOBAL_AIRLINES;
  const airline = pool[index % pool.length];
  const callsign = `${airline}${String(10 + (index * 37) % 989)}`;
  const types = TYPES[category];
  const history = Array.from({ length: HISTORY_LENGTH }, (_, h): [number, number, number] => {
    const ht = Math.max(0, t - (HISTORY_LENGTH - h) * (0.9 / routeMinutes));
    const [lon, lat] = interpolateRoute(from, to, ht);
    return [lon, lat, Math.max(300, altitude - (HISTORY_LENGTH - h) * verticalRate * 54)];
  });

  return {
    id: `demo-${from.iata}-${to.iata}-${index}`,
    callsign,
    registration: `${from.country}-${(index * 104_729 % 1_679_616).toString(36).toUpperCase().padStart(4, '0')}`,
    aircraftType: types[index % types.length],
    country: from.country,
    longitude: position[0],
    latitude: position[1],
    altitude,
    velocity,
    heading: bearingBetween(position, nextPosition),
    verticalRate,
    onGround: false,
    category,
    lastSeenSeconds: 0,
    positionHistory: history,
  };
}

export function generateRealisticDemoFlights(count = DEMO_FLIGHT_COUNT, nowMs = Date.now()): Flight[] {
  return Array.from({ length: count }, (_, index) => makeFlight(index, nowMs));
}

export function demoRouteFor(flight: FlightRecord): { from: string; to: string } | null {
  const match = /^demo-([A-Z]{3})-([A-Z]{3})-\d+$/.exec(flight.id);
  return match ? { from: match[1], to: match[2] } : null;
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
