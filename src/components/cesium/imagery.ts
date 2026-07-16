import {
  ArcGisMapServerImageryProvider,
  Color,
  GeographicTilingScheme,
  GridImageryProvider,
  ImageryLayer,
  TileMapServiceImageryProvider,
  UrlTemplateImageryProvider,
  type Viewer,
} from 'cesium';

export type MapStyle = 'opengrid' | 'dark' | 'satellite' | 'night';
export type ResolvedMapStyle = MapStyle | 'satellite-global';

// ArcGIS' cached Web Mercator imagery begins exposing mismatched source
// resolutions and no-data rectangles well before its mathematical limit.
// Switch to the continuous geographic base before those seams enter view.
export const POLAR_BASEMAP_LATITUDE = 60;
export const SENTINEL_NORTH_LIMIT = 84;
export const ORBITAL_BASEMAP_HEIGHT = 8_000_000;

export function mapStyleForView(
  style: MapStyle,
  latitude: number,
  cameraHeight: number,
): ResolvedMapStyle {
  if (latitude >= POLAR_BASEMAP_LATITUDE && latitude < SENTINEL_NORTH_LIMIT) {
    return style === 'satellite' ? 'satellite-global' : 'opengrid';
  }
  if (latitude <= -POLAR_BASEMAP_LATITUDE || latitude >= SENTINEL_NORTH_LIMIT) return 'opengrid';
  if (cameraHeight < ORBITAL_BASEMAP_HEIGHT) return style;
  return style === 'satellite' ? 'satellite-global' : 'opengrid';
}

export const IMAGERY_SOURCES = {
  localEarth: {
    url: '/cesiumStatic/Assets/Textures/NaturalEarthII/',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
  },
  polarSatellite: {
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025/default/WGS84/{z}/{y}/{x}.jpg',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
  },
  night: {
    url: 'https://openinframap.org/black-marble-2024/{z}/{x}/{y}.webp',
  },
} as const;

function addLayer(
  viewer: Viewer,
  provider: ConstructorParameters<typeof ImageryLayer>[0],
  alpha = 1,
) {
  const layer = new ImageryLayer(provider, {alpha});
  viewer.imageryLayers.add(layer);
  viewer.scene.requestRender();
  return layer;
}

function createGlobalSatelliteProvider() {
  return new UrlTemplateImageryProvider({
    url: IMAGERY_SOURCES.polarSatellite.url,
    tilingScheme: new GeographicTilingScheme({
      numberOfLevelZeroTilesX: 2,
      numberOfLevelZeroTilesY: 1,
    }),
    maximumLevel: 13,
    enablePickFeatures: false,
  });
}

export async function applyMapStyle(viewer: Viewer, style: ResolvedMapStyle, offline = false) {
  viewer.imageryLayers.removeAll(true);

  if (offline) {
    addLayer(viewer, new GridImageryProvider({
      cells: 16,
      color: Color.fromCssColorString('#2c9dcc'),
      glowColor: Color.fromCssColorString('#0a2435'),
      backgroundColor: Color.fromCssColorString('#07141f'),
    }));
    return;
  }

  // Start with Cesium's packaged, geographic Natural Earth pyramid. It is
  // same-origin, deterministic, label-free, and includes both polar caps, so
  // the globe remains complete even when every network source is unavailable.
  const localEarth = await TileMapServiceImageryProvider.fromUrl(IMAGERY_SOURCES.localEarth.url);
  if (viewer.isDestroyed()) return;
  addLayer(viewer, localEarth);

  // Keep the deterministic base unobstructed in orbital and polar views.
  // Regional high-resolution layers are added only when their projection is
  // safely outside the polar no-data region.

  if (style === 'opengrid') return;

  if (style === 'satellite-global') {
    addLayer(viewer, createGlobalSatelliteProvider());
    return;
  }

  if (style === 'satellite') {
    const provider = await ArcGisMapServerImageryProvider.fromUrl(IMAGERY_SOURCES.satellite.url, {
      enablePickFeatures: false,
      usePreCachedTilesIfAvailable: true,
    });
    if (!viewer.isDestroyed()) addLayer(viewer, provider);
    return;
  }

  const provider = new UrlTemplateImageryProvider({
    url: style === 'dark' ? IMAGERY_SOURCES.dark.url : IMAGERY_SOURCES.night.url,
    subdomains: style === 'dark' ? ['a', 'b', 'c', 'd'] : undefined,
    maximumLevel: style === 'dark' ? 20 : 8,
    enablePickFeatures: false,
  });
  addLayer(viewer, provider, style === 'night' ? 0.94 : 1);
}

export function addWeatherLayer(
  viewer: Viewer,
  tileUrl: string,
  opacity: number,
  onError: () => void,
) {
  const provider = new UrlTemplateImageryProvider({
    url: tileUrl,
    maximumLevel: 8,
    enablePickFeatures: false,
  });
  const removeErrorListener = provider.errorEvent.addEventListener(onError);
  const layer = addLayer(viewer, provider, opacity);
  return () => {
    removeErrorListener();
    if (!viewer.isDestroyed() && viewer.imageryLayers.contains(layer)) {
      viewer.imageryLayers.remove(layer, true);
    }
  };
}
