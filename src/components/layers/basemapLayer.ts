import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import type { QualitySettings } from '../../types/quality';

export type MapStyle = 'dark' | 'satellite' | 'night';

export const TILE_URLS: Record<MapStyle, string[]> = {
  dark: [
    'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
    'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
    'https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
  ],
  satellite: [
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ],
  night: [
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
  ],
};

export function createBasemapLayer(mapStyle: MapStyle, quality: QualitySettings) {
  const tileUrls = TILE_URLS[mapStyle] ?? TILE_URLS.dark;

  return new TileLayer({
    id: 'basemap',
    data: tileUrls,
    minZoom: 0,
    maxZoom: 9,
    tileSize: 256,
    maxCacheSize: Math.round(120 * quality.tileCacheScale),
    maxRequests: 16,
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
