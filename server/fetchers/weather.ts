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

    // Use the 3rd-most-recent timestamp (avoids probing, reliably available)
    const idx = Math.max(0, past.length - 3);
    const ts  = past[idx].time;
    const url = `${data.host}/v2/radar/${ts}/256/{z}/{x}/{y}/2/1_1.webp`;

    cachedRadarTileUrl = url;
    console.log(`[weather] Radar tiles updated (ts=${ts})`);
    broadcast({ type: 'weather', data: { radarTileUrl: url }, timestamp: Date.now() }, 'weather');
  } catch (err) {
    console.error('[weather] Fetch error:', (err as Error).message);
  }
}

export function getLastRadarTileUrl(): string | null {
  return cachedRadarTileUrl;
}

export function startWeatherFetcher(): void {
  fetchWeather();
  setInterval(fetchWeather, FETCH_INTERVAL_MS);
  console.log(`[weather] Fetcher started (interval ${FETCH_INTERVAL_MS / 60_000} min)`);
}
