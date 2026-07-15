import type { WeatherFrame } from '../../shared/contracts.js';
import { ProviderError } from './errors.js';

const RAINVIEWER_URL = 'https://api.rainviewer.com/public/weather-maps.json';

type FetchLike = typeof fetch;

interface RainViewerResponse {
  host?: string;
  radar?: {
    past?: Array<{ time?: number; path?: string }>;
  };
}

export class RainViewerProvider {
  constructor(private readonly fetchFn: FetchLike = fetch) {}

  async fetchWeather(): Promise<WeatherFrame> {
    let response: Response;
    try {
      response = await this.fetchFn(RAINVIEWER_URL, { signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      throw new ProviderError(`Weather provider request failed: ${(error as Error).message}`);
    }

    if (!response.ok) {
      throw new ProviderError(`Weather provider returned HTTP ${response.status}`, response.status);
    }

    const payload = await response.json() as RainViewerResponse;
    const latest = payload.radar?.past?.at(-1);
    if (!payload.host || !latest?.path || !Number.isFinite(latest.time)) {
      throw new ProviderError('Weather provider returned no usable radar frame');
    }

    return {
      time: latest.time as number,
      tileUrl: `${payload.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`,
    };
  }
}
