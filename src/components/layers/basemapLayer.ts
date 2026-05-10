import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import type { QualitySettings } from '../../types/quality';

export type MapStyle = 'opengrid' | 'dark' | 'satellite' | 'night';

type TileConfig = {
  urls: string[];
  maxZoom: number;
  desaturate?: number;
  opacity?: number;
};

export const TILE_CONFIGS: Record<MapStyle, TileConfig> = {
  // OpenGridWorks is visually close to OpenInfraMap: an OSM-derived light base map
  // with infrastructure vector overlays. Use the canonical OSM raster tiles here so
  // deck.gl GlobeView can keep the existing 3D globe pipeline.
  opengrid: {
    urls: [
      'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
    ],
    maxZoom: 19,
    desaturate: 0.05,
  },
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
  night: {
    urls: [
      'https://openinframap.org/black-marble-2024/{z}/{x}/{y}.webp',
    ],
    maxZoom: 8,
    opacity: 0.9,
  },
};

export function createBasemapLayer(mapStyle: MapStyle, quality: QualitySettings) {
  const cfg = TILE_CONFIGS[mapStyle] ?? TILE_CONFIGS.opengrid;

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
        desaturate: cfg.desaturate ?? 0,
        opacity: cfg.opacity ?? 1,
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
