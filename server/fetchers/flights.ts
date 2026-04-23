import { broadcast } from '../ws.js';
import { saveFlightSnapshot, pruneOldData } from '../db.js';

const OPENSKY_URL        = 'https://opensky-network.org/api/states/all';
const FETCH_INTERVAL_MS  = 20_000;
const RATE_LIMIT_BACKOFF = 60_000;
const MAX_FLIGHTS        = 5_000;  // server keeps more; client can filter down
const HISTORY_LENGTH     = 10;

// Server-side position history so clients get accurate trail data
const posHistory = new Map<string, [number, number, number][]>();

let isRateLimited  = false;
let lastFetchAt    = 0;
let fetchCount     = 0;

function inferCategory(rawCat: number, velocity: number): string {
  if (rawCat === 1) return 'light';
  if (rawCat === 2) return 'small';
  if (rawCat === 3 || rawCat === 4) return 'medium';
  if (rawCat === 5 || rawCat === 6) return 'heavy';
  if (rawCat === 7) return 'high_performance';
  if (rawCat === 8) return 'rotorcraft';
  if (velocity > 200) return 'heavy';
  if (velocity > 120) return 'large';
  if (velocity > 60)  return 'medium';
  return 'light';
}

async function fetchFlights(): Promise<void> {
  const now = Date.now();

  // Honour rate-limit backoff window
  if (isRateLimited && now - lastFetchAt < RATE_LIMIT_BACKOFF) {
    broadcast({ type: 'flights', data: [], rateLimited: true, simulated: false, timestamp: now }, 'flights');
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
      broadcast({ type: 'flights', data: [], rateLimited: true, simulated: false, timestamp: now }, 'flights');
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
    // Don't broadcast on error — clients keep their last known state
  }
}

export function startFlightFetcher(): void {
  fetchFlights();
  setInterval(fetchFlights, FETCH_INTERVAL_MS);
  console.log(`[flights] Fetcher started (interval ${FETCH_INTERVAL_MS / 1000} s)`);
}
