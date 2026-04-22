import { useState, useEffect } from 'react';

export function useWeatherData(enabled: boolean) {
  const [radarTileUrl, setRadarTileUrl] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRadarTileUrl(null);
      return;
    }

    const fetchWeatherMaps = async () => {
      try {
        const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        if (!response.ok) throw new Error(`RainViewer API ${response.status}`);
        const data = await response.json();
        const host: string = data.host;
        const past: { time: number }[] = data.radar?.past ?? [];

        if (past.length === 0) return;

        // Try timestamps from newest to oldest; skip 410/404 tiles
        const candidates = [...past].reverse().slice(0, 5);
        for (const { time } of candidates) {
          const testPath = `${host}/v2/radar/${time}/256/4/8/5/2/1_1.webp`;
          try {
            const probe = await fetch(testPath, { method: 'HEAD' });
            if (probe.ok) {
              setRadarTileUrl(`${host}/v2/radar/${time}/256/{z}/{x}/{y}/2/1_1.webp`);
              setLastUpdated(new Date(time * 1000));
              return;
            }
          } catch {
            // Try next
          }
        }

        // Fallback: use 3rd-most-recent without probing
        const fallbackIdx = past.length > 2 ? past.length - 3 : past.length - 1;
        const ts = past[fallbackIdx].time;
        setRadarTileUrl(`${host}/v2/radar/${ts}/256/{z}/{x}/{y}/2/1_1.webp`);
        setLastUpdated(new Date(ts * 1000));
      } catch (err) {
        console.error('Failed to fetch weather maps', err);
      }
    };

    fetchWeatherMaps();
    const interval = setInterval(fetchWeatherMaps, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [enabled]);

  return { radarTileUrl, lastUpdated };
}
