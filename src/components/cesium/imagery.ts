import {
  ArcGisMapServerImageryProvider,
  Color,
  GeographicTilingScheme,
  GridImageryProvider,
  ImageryLayer,
  UrlTemplateImageryProvider,
  WebMapServiceImageryProvider,
  type Viewer,
} from 'cesium';

export type MapStyle = 'opengrid' | 'dark' | 'satellite' | 'night';

export const IMAGERY_SOURCES = {
  globalRelief: {
    url: 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi',
    layer: 'BlueMarble_ShadedRelief_Bathymetry',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
  },
  night: {
    url: 'https://openinframap.org/black-marble-2024/{z}/{x}/{y}.webp',
  },
} as const;

function createGlobalReliefProvider() {
  return new WebMapServiceImageryProvider({
    url: IMAGERY_SOURCES.globalRelief.url,
    layers: IMAGERY_SOURCES.globalRelief.layer,
    parameters: {
      format: 'image/jpeg',
      transparent: false,
      version: '1.1.1',
    },
    tilingScheme: new GeographicTilingScheme({
      numberOfLevelZeroTilesX: 2,
      numberOfLevelZeroTilesY: 1,
    }),
    maximumLevel: 7,
    enablePickFeatures: false,
  });
}

function addLayer(viewer: Viewer, provider: ConstructorParameters<typeof ImageryLayer>[0], alpha = 1) {
  const layer = new ImageryLayer(provider, {alpha});
  viewer.imageryLayers.add(layer);
  return layer;
}

export async function applyMapStyle(viewer: Viewer, style: MapStyle, offline = false) {
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

  // A geographic (EPSG:4326) Blue Marble layer is always kept underneath the
  // selected style. Unlike Web Mercator, it covers both poles without a void.
  addLayer(viewer, createGlobalReliefProvider());

  if (style === 'opengrid') return;

  if (style === 'satellite') {
    const provider = await ArcGisMapServerImageryProvider.fromUrl(IMAGERY_SOURCES.satellite.url, {
      enablePickFeatures: false,
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
