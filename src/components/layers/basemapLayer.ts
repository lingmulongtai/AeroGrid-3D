import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import type { QualitySettings } from '../../types/quality';

export type MapStyle = 'opengrid' | 'dark' | 'satellite' | 'night';

type TileSource = {
  urls: string[];
  maxZoom: number;
  tileSize: 256 | 512;
  desaturate?: number;
  opacity?: number;
};

type TileConfig = {
  base: TileSource;
  labels?: TileSource;
};

const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd'];
const cartoRetina = (style: 'dark_nolabels' | 'dark_only_labels') =>
  CARTO_SUBDOMAINS.map((subdomain) =>
    `https://${subdomain}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}@2x.png`,
  );

export const TILE_CONFIGS: Record<MapStyle, TileConfig> = {
  opengrid: {
    base: {
      urls: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      maxZoom: 19,
      tileSize: 256,
      desaturate: 0.08,
    },
  },
  dark: {
    base: {
      urls: cartoRetina('dark_nolabels'),
      maxZoom: 20,
      tileSize: 512,
      desaturate: 0.06,
    },
    labels: {
      urls: cartoRetina('dark_only_labels'),
      maxZoom: 20,
      tileSize: 512,
      opacity: 0.95,
    },
  },
  satellite: {
    base: {
      urls: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      maxZoom: 19,
      tileSize: 256,
    },
    labels: {
      urls: [
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      maxZoom: 16,
      tileSize: 256,
      opacity: 0.92,
    },
  },
  night: {
    base: {
      urls: ['https://openinframap.org/black-marble-2024/{z}/{x}/{y}.webp'],
      maxZoom: 8,
      tileSize: 256,
      opacity: 0.94,
    },
  },
};

const WEB_MERCATOR_EXTENT: [number, number, number, number] = [
  -180,
  -85.051129,
  180,
  85.051129,
];

function createRasterLayer(
  id: string,
  source: TileSource,
  quality: QualitySettings,
  labelLayer = false,
) {
  return new TileLayer({
    id,
    data: source.urls,
    minZoom: 0,
    maxZoom: source.maxZoom,
    tileSize: source.tileSize,
    maxCacheSize: Math.round((labelLayer ? 150 : 240) * quality.tileCacheScale),
    maxRequests: labelLayer ? 12 : 18,
    debounceTime: labelLayer ? 110 : 70,
    refinementStrategy: 'best-available',
    extent: WEB_MERCATOR_EXTENT,
    renderSubLayers: (props: any) => {
      const { west, south, east, north } = props.tile.bbox;
      return new BitmapLayer(props, {
        data: null,
        image: props.data,
        bounds: [west, south, east, north],
        desaturate: source.desaturate ?? 0,
        opacity: source.opacity ?? 1,
        textureParameters: {
          minFilter: 'linear',
          magFilter: 'linear',
        },
      } as any);
    },
  });
}

export function createBasemapLayers(mapStyle: MapStyle, quality: QualitySettings) {
  const config = TILE_CONFIGS[mapStyle] ?? TILE_CONFIGS.dark;
  const layers = [createRasterLayer(`basemap-${mapStyle}`, config.base, quality)];

  if (config.labels) {
    layers.push(createRasterLayer(`basemap-${mapStyle}-labels`, config.labels, quality, true));
  }

  return layers;
}

export function createWeatherTileLayer(
  radarTileUrl: string,
  opacity: number,
  onTileError?: (error: unknown) => void,
) {
  return new TileLayer({
    id: 'weather-radar',
    data: radarTileUrl,
    minZoom: 0,
    maxZoom: 8,
    tileSize: 256,
    maxRequests: 12,
    debounceTime: 100,
    refinementStrategy: 'best-available',
    extent: WEB_MERCATOR_EXTENT,
    onTileError,
    renderSubLayers: (props: any) => {
      const { west, south, east, north } = props.tile.bbox;
      return new BitmapLayer(props, {
        data: null,
        image: props.data,
        bounds: [west, south, east, north],
        opacity,
        textureParameters: {
          minFilter: 'linear',
          magFilter: 'linear',
        },
      } as any);
    },
  });
}
