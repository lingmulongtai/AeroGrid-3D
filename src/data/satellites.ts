import { siderealAngle } from '../globe/astro';
import { eciToGeodetic, gstime, json2satrec, sgp4, type SatRec } from 'satellite.js';
import type { OrbitalElements } from '../../shared/live';

// A deterministic, physically plausible demo constellation. Orbits are
// circular Keplerian orbits propagated in an inertial frame and rotated by
// real sidereal time, so ground tracks and day/night geometry look right.
// Positions are simulated and are never presented as live telemetry.

export type SatelliteCategory =
  | 'station'
  | 'starlink'
  | 'broadband'
  | 'navigation'
  | 'geostationary'
  | 'earth-observation';

export type SatelliteModelKind = 'station' | 'starlink' | 'satellite';

export interface SatelliteRecord {
  id: string;
  name: string;
  category: SatelliteCategory;
  model: SatelliteModelKind;
  altitudeKm: number;
  inclination: number;
  raan: number;
  phase: number;
  periodMinutes: number;
  elements?: OrbitalElements;
}

export interface SatelliteState {
  longitude: number;
  latitude: number;
  altitudeKm: number;
  speedKmS: number;
}

const MU = 398_600.4418;
const EARTH_RADIUS_KM = 6371;
const EPOCH_MS = Date.UTC(2026, 0, 1);
const DEG = Math.PI / 180;
const SIDEREAL_DAY_MIN = 1436.0682;
const DAY_MS = 86_400_000;
const EARTH_ROTATION_RAD_S = 7.2921159e-5;

export interface SatelliteFrame {
  timeMs: number;
  sidereal: number;
  gmst: number;
  centuries: number;
}

/** One GMST evaluation per frame. Demo GAST and live GMST must remain distinct. */
export function satelliteFrame(timeMs: number, sidereal: number): SatelliteFrame {
  const jd = timeMs / DAY_MS + 2440587.5;
  return { timeMs, sidereal, gmst: gstime(jd), centuries: (jd - 2451545) / 36525 };
}

function sampleGmst(frame: SatelliteFrame, timeMs: number) {
  // Exact difference of satellite.js's cubic GMST polynomial, including long
  // selected-orbit samples. No per-satellite Date or gstime calls are needed.
  const t = frame.centuries;
  const d = (timeMs - frame.timeMs) / DAY_MS / 36525;
  const seconds = d * (876600 * 3600 + 8640184.812866 + 2 * 0.093104 * t - 3 * 6.2e-6 * t * t)
    + d * d * (0.093104 - 3 * 6.2e-6 * t) - 6.2e-6 * d * d * d;
  return frame.gmst + seconds * DEG / 240;
}

function periodFor(altitudeKm: number) {
  const radius = EARTH_RADIUS_KM + altitudeKm;
  return (2 * Math.PI * Math.sqrt(radius ** 3 / MU)) / 60;
}

function record(
  id: string, name: string, category: SatelliteCategory, model: SatelliteModelKind,
  altitudeKm: number, inclination: number, raan: number, phase: number, periodMinutes = periodFor(altitudeKm),
): SatelliteRecord {
  return { id, name, category, model, altitudeKm, inclination, raan, phase, periodMinutes };
}

function walker(prefix: string, label: string, category: SatelliteCategory, model: SatelliteModelKind,
  altitudeKm: number, inclination: number, planes: number, perPlane: number, raanOffset = 0, phasing = 1, startNumber = 1) {
  const list: SatelliteRecord[] = [];
  for (let p = 0; p < planes; p++) {
    for (let s = 0; s < perPlane; s++) {
      const n = startNumber + p * perPlane + s;
      list.push(record(
        `${prefix}-${n}`,
        `${label}-${String(n).padStart(4, '0')}`,
        category,
        model,
        altitudeKm,
        inclination,
        raanOffset + (360 / planes) * p,
        (360 / perPlane) * s + (360 / (planes * perPlane)) * phasing * p,
      ));
    }
  }
  return list;
}

const GEO_EPOCH_ANGLE = siderealAngle(new Date(EPOCH_MS)) / DEG;

function geostationary(): SatelliteRecord[] {
  const slots = [-135, -129, -122, -116, -101, -97, -91, -87, -75, -61, -53, -45, -37, -30, -22, -15, -8, -1, 5, 9, 13, 16, 19, 23, 28, 33, 39, 45, 52, 57, 63, 69, 75, 83, 88, 93, 100, 105, 110, 116, 122, 128, 132, 136, 140, 144, 150, 154, 158, 163, 166, 172, 177, -178, -170, -160, -150, -144];
  return slots.map((lon, index) => record(
    `geo-${index + 1}`, `GEO Comsat ${index + 1}`, 'geostationary', 'satellite',
    35_786, 0.05, 0, lon + GEO_EPOCH_ANGLE, SIDEREAL_DAY_MIN,
  ));
}

function sunSynchronous(): SatelliteRecord[] {
  const names = ['Sentinel', 'Landsat', 'Terra', 'Aqua', 'NOAA', 'MetOp', 'Himawari-LEO', 'WorldView', 'Pleiades', 'Suomi'];
  return Array.from({ length: 48 }, (_, i) => {
    const altitude = 480 + ((i * 53) % 340);
    const inclination = 97.2 + (altitude - 480) / 340 * 1.6;
    return record(`eo-${i + 1}`, `${names[i % names.length]} ${Math.floor(i / names.length) + 1}`, 'earth-observation', 'satellite',
      altitude, inclination, (i * 47) % 360, (i * 137) % 360);
  });
}

const FIXED: SatelliteRecord[] = [
  record('iss', 'ISS', 'station', 'station', 418, 51.64, 32, 18),
  record('tiangong', 'Tiangong', 'station', 'station', 386, 41.47, 214, 133),
  ...walker('gps', 'GPS', 'navigation', 'satellite', 20_180, 55, 6, 5, 17, 1),
  ...walker('galileo', 'Galileo', 'navigation', 'satellite', 23_222, 56, 3, 8, 40, 1),
  ...walker('glonass', 'GLONASS', 'navigation', 'satellite', 19_130, 64.8, 3, 8, 75, 1),
  ...geostationary(),
  ...sunSynchronous(),
  ...walker('iridium', 'Iridium', 'broadband', 'satellite', 780, 86.4, 6, 11, 0, 2),
];

const SCALABLE: SatelliteRecord[][] = [
  walker('oneweb', 'OneWeb', 'broadband', 'starlink', 1_200, 87.9, 12, 36, 4, 1),
  walker('starlink-a', 'Starlink', 'starlink', 'starlink', 550, 53, 72, 22, 0, 17, 1000),
  walker('starlink-b', 'Starlink', 'starlink', 'starlink', 540, 53.2, 72, 22, 2.5, 13, 3000),
  walker('starlink-c', 'Starlink', 'starlink', 'starlink', 570, 70, 36, 20, 1, 11, 5000),
  walker('starlink-d', 'Starlink', 'starlink', 'starlink', 560, 97.6, 10, 40, 7, 3, 6000),
];

const SCALABLE_TOTAL = SCALABLE.reduce((sum, group) => sum + group.length, 0);

const cache = new Map<number, SatelliteRecord[]>();
const propagatedRecords = new WeakMap<SatelliteRecord, SatRec>();

export function constellationFromElements(elements: OrbitalElements[], maxCount: number, timeMs = Date.now()): SatelliteRecord[] {
  const ordered = [...elements].sort((a, b) => {
    const priority = (e: OrbitalElements) => e.NORAD_CAT_ID === 25544 || e.NORAD_CAT_ID === 48274 ? 0 : /STARLINK/i.test(e.OBJECT_NAME) ? 2 : 1;
    return priority(a) - priority(b) || a.NORAD_CAT_ID - b.NORAD_CAT_ID;
  });
  const valid: SatelliteRecord[] = [];
  for (const e of ordered) {
    if (valid.length >= maxCount) break;
    const epoch = Date.parse(`${e.EPOCH.replace(/Z$/, '')}Z`);
    if (timeMs - epoch > 14 * 24 * 60 * 60_000 || epoch > timeMs + 24 * 60 * 60_000) continue;
    const station = e.NORAD_CAT_ID === 25544 || e.NORAD_CAT_ID === 48274;
    const category: SatelliteCategory = station ? 'station' : /STARLINK/i.test(e.OBJECT_NAME) ? 'starlink' : /ONEWEB|IRIDIUM/i.test(e.OBJECT_NAME) ? 'broadband' : /GPS|GALILEO|GLONASS|BEIDOU/i.test(e.OBJECT_NAME) ? 'navigation' : e.MEAN_MOTION < 1.1 ? 'geostationary' : 'earth-observation';
    const periodMinutes = 1440 / e.MEAN_MOTION;
    const altitudeKm = Math.cbrt(MU * (periodMinutes * 60 / (2 * Math.PI)) ** 2) - EARTH_RADIUS_KM;
    const satellite: SatelliteRecord = { id: `norad-${e.NORAD_CAT_ID}`, name: e.OBJECT_NAME, category, model: station ? 'station' : category === 'starlink' ? 'starlink' : 'satellite', altitudeKm, inclination: e.INCLINATION, raan: e.RA_OF_ASC_NODE, phase: e.MEAN_ANOMALY, periodMinutes, elements: e };
    const satrec = json2satrec(e);
    if (!sgp4(satrec, (timeMs / DAY_MS + 2440587.5 - satrec.jdsatepoch) * 1440)) continue;
    propagatedRecords.set(satellite, satrec);
    valid.push(satellite);
  }
  return valid;
}

function propagatedState(satellite: SatelliteRecord, timeMs: number) {
  if (!satellite.elements) return null;
  let satrec = propagatedRecords.get(satellite);
  if (!satrec) { satrec = json2satrec(satellite.elements); propagatedRecords.set(satellite, satrec); }
  // Match Date's millisecond resolution in the original propagate(Date) API.
  return sgp4(satrec, (Math.trunc(timeMs) / DAY_MS + 2440587.5 - satrec.jdsatepoch) * 1440);
}

/** Deterministic constellation limited to maxCount, thinning mega-constellations evenly. */
export function buildConstellation(maxCount: number): SatelliteRecord[] {
  const cached = cache.get(maxCount);
  if (cached) return cached;
  const remaining = Math.max(0, maxCount - FIXED.length);
  const ratio = Math.min(1, remaining / SCALABLE_TOTAL);
  const list = [...FIXED.slice(0, maxCount)];
  const takes = SCALABLE.map((group) => Math.floor(group.length * ratio));
  let leftover = Math.min(remaining, SCALABLE_TOTAL) - takes.reduce((sum, take) => sum + take, 0);
  for (let i = 0; leftover > 0; i = (i + 1) % SCALABLE.length) {
    if (takes[i] < SCALABLE[i].length) {
      takes[i]++;
      leftover--;
    }
  }
  for (const [index, group] of SCALABLE.entries()) {
    const take = takes[index];
    if (!take) continue;
    const stride = group.length / take;
    for (let i = 0; i < take; i++) list.push(group[Math.floor(i * stride)]);
  }
  cache.set(maxCount, list);
  return list;
}

/** Inertial (equatorial) position in km. */
export function satelliteInertialPosition(satellite: SatelliteRecord, timeMs: number, out: { x: number; y: number; z: number }) {
  if (satellite.elements) {
    const state = propagatedState(satellite, timeMs);
    if (!state) { out.x = out.y = out.z = NaN; return out; }
    Object.assign(out, state.position);
    return out;
  }
  const radius = EARTH_RADIUS_KM + satellite.altitudeKm;
  const minutes = (timeMs - EPOCH_MS) / 60_000;
  const u = (satellite.phase + (360 * minutes) / satellite.periodMinutes) * DEG;
  const i = satellite.inclination * DEG;
  const raan = satellite.raan * DEG;
  const cosU = Math.cos(u);
  const sinU = Math.sin(u);
  const cosR = Math.cos(raan);
  const sinR = Math.sin(raan);
  const cosI = Math.cos(i);
  out.x = radius * (cosR * cosU - sinR * sinU * cosI);
  out.y = radius * (sinR * cosU + cosR * sinU * cosI);
  out.z = radius * (sinU * Math.sin(i));
  return out;
}

/** Earth-fixed world position (x = 90°E, y = north, z = 0°E) in km. */
export function satelliteWorldPosition(satellite: SatelliteRecord, timeMs: number, sidereal: number, out: { x: number; y: number; z: number }) {
  return sampleSatelliteWorldPosition(satellite, timeMs, satelliteFrame(timeMs, sidereal), out);
}

/** Exact WGS84 sample using a shared frame clock, also used for cached history. */
export function sampleSatelliteWorldPosition<T extends { x: number; y: number; z: number }>(satellite: SatelliteRecord, timeMs: number, frame: SatelliteFrame, out: T): T {
  if (satellite.elements) {
    timeMs = Math.trunc(timeMs);
    const state = propagatedState(satellite, timeMs);
    if (!state) { out.x = out.y = out.z = NaN; return out; }
    // Render WGS84 geodetic altitude on the application's spherical globe.
    const gd = eciToGeodetic(state.position, sampleGmst(frame, timeMs));
    const radius = EARTH_RADIUS_KM + gd.height;
    out.x = radius * Math.cos(gd.latitude) * Math.sin(gd.longitude);
    out.y = radius * Math.sin(gd.latitude);
    out.z = radius * Math.cos(gd.latitude) * Math.cos(gd.longitude);
    return out;
  }
  const p = satelliteInertialPosition(satellite, timeMs, out);
  const angle = frame.sidereal + EARTH_ROTATION_RAD_S * (timeMs - frame.timeMs) / 1000;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const ex = cos * p.x + sin * p.y;
  const ey = -sin * p.x + cos * p.y;
  const ez = p.z;
  out.x = ey;
  out.y = ez;
  out.z = ex;
  return out;
}

export function satelliteState(satellite: SatelliteRecord, timeMs: number): SatelliteState {
  const p = satelliteWorldPosition(satellite, timeMs, siderealAngle(new Date(timeMs)), { x: 0, y: 0, z: 0 });
  const radius = Math.hypot(p.x, p.y, p.z);
  return {
    longitude: Math.atan2(p.x, p.z) / DEG,
    latitude: Math.asin(p.y / radius) / DEG,
    altitudeKm: radius - EARTH_RADIUS_KM,
    speedKmS: satellite.elements ? (() => { const v = propagatedState(satellite, timeMs)?.velocity; return v ? Math.hypot(v.x, v.y, v.z) : NaN; })() : (2 * Math.PI * radius) / (satellite.periodMinutes * 60),
  };
}

export const SATELLITE_COLORS: Record<SatelliteCategory, string> = {
  station: '#5dff9b',
  starlink: '#b9d4ff',
  broadband: '#7fe7ff',
  navigation: '#c58bff',
  geostationary: '#ffb35c',
  'earth-observation': '#61e6c8',
};
