import { describe, expect, it, vi } from 'vitest';
import { RainViewerProvider } from './rainViewer';

describe('RainViewerProvider', () => {
  it('uses the latest documented PNG radar frame', async () => {
    const fetchFn = vi.fn(async () => Response.json({
      host: 'https://tilecache.rainviewer.com',
      radar: { past: [
        { time: 100, path: '/v2/radar/100' },
        { time: 200, path: '/v2/radar/200' },
      ] },
    }));
    const provider = new RainViewerProvider(fetchFn as typeof fetch);

    await expect(provider.fetchWeather()).resolves.toEqual({
      time: 200,
      tileUrl: 'https://tilecache.rainviewer.com/v2/radar/200/256/{z}/{x}/{y}/2/1_1.png',
    });
  });

  it('rejects metadata without a usable frame', async () => {
    const provider = new RainViewerProvider(vi.fn(async () => Response.json({ radar: { past: [] } })) as typeof fetch);
    await expect(provider.fetchWeather()).rejects.toThrow('no usable radar frame');
  });
});
