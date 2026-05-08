import { broadcast } from '../ws.js';

const RAINVIEWER_URL    = 'https://api.rainviewer.com/public/weather-maps.json';
const FETCH_INTERVAL_MS = 10 * 60_000; // 10 minutes

let cachedRadarTileUrl: string | null = null;

async function fetchWeather(): Promise<void> {
  try {
    const res = await fetch(RAINVIEWER_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as {
      host: string;
      radar: { past: { time: number }[] };
    };

    const past = data.radar?.past ?? [];
    if (past.length === 0) return;

    const ts = await findAvailableRadarTimestamp(data.host, past);
    if (!ts) return;

    const url = `${data.host}/v2/radar/${ts}/256/{z}/{x}/{y}/2/1_1.webp`;

    cachedRadarTileUrl = url;
    console.log(`[weather] Radar tiles updated (ts=${ts})`);
    broadcast({ type: 'weather', data: { radarTileUrl: url }, timestamp: Date.now() }, 'weather');
  } catch (err) {
    console.error('[weather] Fetch error:', (err as Error).message);
  }
}

async function findAvailableRadarTimestamp(
  host: string,
  past: { time: number }[],
): Promise<number | null> {
  const candidates = [...past].reverse().slice(0, 6);

  for (const { time } of candidates) {
    try {
      const probe = await fetch(`${host}/v2/radar/${time}/256/4/8/5/2/1_1.webp`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(4_000),
      });
      if (probe.ok) return time;
    } catch {
      // Try the next radar frame.
    }
  }

  return past.at(-1)?.time ?? null;
}

export function getLastRadarTileUrl(): string | null {
  return cachedRadarTileUrl;
}

export function startWeatherFetcher(): void {
  fetchWeather();
  setInterval(fetchWeather, FETCH_INTERVAL_MS);
  console.log(`[weather] Fetcher started (interval ${FETCH_INTERVAL_MS / 60_000} min)`);
}
