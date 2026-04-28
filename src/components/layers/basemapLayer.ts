import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import type { QualitySettings } from '../../types/quality';

export type MapStyle = 'dark' | 'satellite' | 'night';

type TileConfig = {
  urls: string[];
  maxZoom: number;
};

export const TILE_CONFIGS: Record<MapStyle, TileConfig> = {
  dark: {
    urls: [
      'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    ],
    maxZoom: 20,
  },
  satellite: {
    urls: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    maxZoom: 19,
  },
  // NASA city-lights tiles have a low zoom cap and often trigger "zoom level not supported"
  // at close zooms. Use a high-zoom dark style here for stable UX.
  night: {
    urls: [
      'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
    ],
    maxZoom: 20,
  },
};

export function createBasemapLayer(mapStyle: MapStyle, quality: QualitySettings) {
  const cfg = TILE_CONFIGS[mapStyle] ?? TILE_CONFIGS.dark;

  return new TileLayer({
    id: 'basemap',
    data: cfg.urls,
    minZoom: 0,
    maxZoom: cfg.maxZoom,
    tileSize: 256,
    maxCacheSize: Math.round(220 * quality.tileCacheScale),
    maxRequests: 24,
    refinementStrategy: 'best-available',
    extent: [-180, -85, 180, 85],
    renderSubLayers: (props: any) => {
      const { west, south, east, north } = props.tile.bbox;
      return new BitmapLayer(props, {
        data: null,
        image: props.data,
        bounds: [west, south, east, north],
        desaturate: mapStyle === 'night' ? 0.15 : 0,
      } as any);
    },
  });
}

export function createWeatherTileLayer(radarTileUrl: string) {
  return new TileLayer({
    id: 'weather-radar',
    data: radarTileUrl,
    minZoom: 0,
    maxZoom: 8,
    tileSize: 256,
    refinementStrategy: 'best-available',
    renderSubLayers: (props: any) => {
      const { west, south, east, north } = props.tile.bbox;
      return new BitmapLayer(props, {
        data: null,
        image: props.data,
        bounds: [west, south, east, north],
        opacity: 0.5,
      } as any);
    },
  });
}
