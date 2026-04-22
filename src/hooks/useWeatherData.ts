import { useState, useEffect } from 'react';

export function useWeatherData(enabled: boolean) {
  const [radarTileUrl, setRadarTileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRadarTileUrl(null);
      return;
    }

    const fetchWeatherMaps = async () => {
      try {
        const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const data = await response.json();
        const host = data.host;
        const past = data.radar.past;
        if (past && past.length > 0) {
          // Use the 3rd most recent to ensure the radar data has fully propagated to CDN nodes
          // The very latest ones might return 410 if they are still being processed/synced or just rotated out.
          const index = past.length > 2 ? past.length - 3 : past.length - 1;
          const stableTimestamp = past[index].time;
          
          // url format: {host}/v2/radar/{ts}/{size}/{z}/{x}/{y}/{color}/{options}.webp
          const url = `${host}/v2/radar/${stableTimestamp}/256/{z}/{x}/{y}/2/1_1.webp`;
          setRadarTileUrl(url);
        }
      } catch (err) {
        console.error("Failed to fetch weather maps", err);
      }
    };

    fetchWeatherMaps();
    
    // Update every 10 minutes
    const interval = setInterval(fetchWeatherMaps, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [enabled]);

  return { radarTileUrl };
}
