import {useEffect, useMemo, useRef, useState} from 'react';
import {
  ArcGISTiledElevationTerrainProvider,
  Cartesian3,
  Color,
  EllipsoidTerrainProvider,
  HeadingPitchRange,
  Matrix4,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
} from 'cesium';
import type {AppMode, FlightRecord} from '../../shared/contracts';
import type {LayerVisibility} from '../types/layers';
import type {QualitySettings} from '../types/quality';
import type {Translator} from '../i18n';
import {MapControls} from './MapControls';
import {
  configureEarthCamera,
  INITIAL_CAMERA,
  installEarthOrbitControls,
  readEarthCamera,
  resetEarthCamera,
  type GlobeViewState,
} from './cesium/camera';
import {
  addWeatherLayer,
  applyMapStyle,
  mapStyleForView,
  POLAR_BASEMAP_LATITUDE,
  type MapStyle,
} from './cesium/imagery';
import {
  aircraftLodForHeight,
  installFlightSelection,
  installSatellitePreview,
  installSceneContent,
} from './cesium/sceneContent';
import {terrainModeForView, type TerrainMode} from './cesium/terrain';

export type ColorMode = 'altitude' | 'speed' | 'category';
export type {GlobeViewState, MapStyle};

interface MapProps {
  mode: AppMode;
  layers: LayerVisibility;
  colorMode: ColorMode;
  mapStyle: MapStyle;
  flights: FlightRecord[];
  radarTileUrl: string | null;
  weatherOpacity: number;
  selectedFlight: FlightRecord | null;
  trackedFlight: FlightRecord | null;
  quality: QualitySettings;
  onFlightClick: (flight: FlightRecord) => void;
  onViewStateChange: (viewState: GlobeViewState) => void;
  onWeatherTileError: () => void;
  t: Translator;
}

type TerrainState = 'loading' | TerrainMode;

const TERRAIN_URL =
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';
const E2E_OFFLINE_GLOBE = import.meta.env.VITE_E2E === 'true';

function isFlightRecord(value: unknown): value is FlightRecord {
  return Boolean(value && typeof value === 'object' && 'callsign' in value && 'latitude' in value);
}

export function EarthMap({
  mode, layers, colorMode, mapStyle, flights, radarTileUrl, weatherOpacity,
  selectedFlight, trackedFlight, quality, onFlightClick, onViewStateChange,
  onWeatherTileError, t,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [nightLighting, setNightLighting] = useState(false);
  const [terrainState, setTerrainState] = useState<TerrainState>('loading');
  const [cameraState, setCameraState] = useState<GlobeViewState>({
    ...INITIAL_CAMERA,
    zoom: 1.35,
  });
  const visibleFlights = useMemo(
    () => flights.slice(0, quality.maxFlights),
    [flights, quality.maxFlights],
  );
  const effectiveMapStyle = mapStyleForView(
    mapStyle,
    cameraState.latitude,
    cameraState.height,
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const nextViewer = new Viewer(containerRef.current, {
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      scene3DOnly: true,
      sceneModePicker: false,
      selectionIndicator: false,
      shouldAnimate: false,
      timeline: false,
      terrainProvider: new EllipsoidTerrainProvider(),
      requestRenderMode: true,
      maximumRenderTimeChange: Number.POSITIVE_INFINITY,
    });

    const {scene} = nextViewer;
    const ellipsoidTerrain = nextViewer.terrainProvider;
    let detailedTerrain: ArcGISTiledElevationTerrainProvider | null = null;
    let activeTerrainMode: TerrainMode = 'ellipsoid';
    configureEarthCamera(nextViewer);
    const removeOrbitControls = installEarthOrbitControls(nextViewer);
    scene.globe.depthTestAgainstTerrain = true;
    // Cesium's ground-atmosphere shader produces a circular pole singularity
    // on the WGS84 ellipsoid in high orbital views. The sky atmosphere still
    // provides the blue limb without painting a grey disc onto Antarctica.
    scene.globe.showGroundAtmosphere = false;
    scene.globe.baseColor = Color.fromCssColorString('#15394a');
    scene.globe.showSkirts = true;
    scene.fog.enabled = true;
    scene.fog.density = 0.00012;
    scene.postProcessStages.fxaa.enabled = true;
    if ('msaaSamples' in scene) scene.msaaSamples = Math.min(4, quality.dpr > 1 ? 4 : 2);

    const updateCameraState = () => {
      if (nextViewer.isDestroyed()) return;
      const state = readEarthCamera(nextViewer);
      const nextTerrainMode = terrainModeForView({
        height: state.height,
        latitude: state.latitude,
        detailedTerrainAvailable: detailedTerrain !== null,
      });
      if (nextTerrainMode !== activeTerrainMode) {
        activeTerrainMode = nextTerrainMode;
        nextViewer.terrainProvider = nextTerrainMode === 'terrain'
          ? detailedTerrain!
          : ellipsoidTerrain;
        setTerrainState(nextTerrainMode);
      }
      setCameraState(state);
      onViewStateChange(state);
    };
    nextViewer.camera.moveEnd.addEventListener(updateCameraState);
    nextViewer.camera.setView({
      destination: Cartesian3.fromDegrees(
        INITIAL_CAMERA.longitude,
        INITIAL_CAMERA.latitude,
        INITIAL_CAMERA.height,
      ),
      orientation: {heading: 0, pitch: -Math.PI / 2, roll: 0},
    });
    updateCameraState();
    setViewer(nextViewer);

    let cancelled = false;
    if (E2E_OFFLINE_GLOBE) {
      setTerrainState('ellipsoid');
    } else {
      ArcGISTiledElevationTerrainProvider.fromUrl(TERRAIN_URL)
        .then((terrainProvider) => {
          if (cancelled || nextViewer.isDestroyed()) return;
          detailedTerrain = terrainProvider;
          updateCameraState();
          scene.requestRender();
        })
        .catch(() => {
          if (!cancelled) setTerrainState('ellipsoid');
        });
    }

    return () => {
      cancelled = true;
      removeOrbitControls();
      nextViewer.camera.moveEnd.removeEventListener(updateCameraState);
      setViewer(null);
      nextViewer.destroy();
    };
  }, [onViewStateChange, quality.dpr]);

  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    applyMapStyle(viewer, effectiveMapStyle, E2E_OFFLINE_GLOBE).catch(() => {
      if (!cancelled && !viewer.isDestroyed()) applyMapStyle(viewer, 'opengrid', E2E_OFFLINE_GLOBE).catch(() => undefined);
    });
    return () => { cancelled = true; };
  }, [effectiveMapStyle, viewer]);

  useEffect(() => {
    if (!viewer || !layers.weather || mode !== 'live-beta' || !radarTileUrl) return;
    return addWeatherLayer(viewer, radarTileUrl, weatherOpacity, onWeatherTileError);
  }, [layers.weather, mode, onWeatherTileError, radarTileUrl, viewer, weatherOpacity]);

  useEffect(() => {
    if (!viewer) return;
    return installSceneContent({
      viewer,
      flights: visibleFlights,
      colorMode,
      showFlights: layers.flights,
      showTrails: layers.flightTrails,
      showAirports: layers.airports,
      showLabels: layers.labels,
      cameraHeight: cameraState.height,
      maximumDetailedAircraft: quality.maxAircraftModels,
      selectedFlightId: selectedFlight?.id ?? null,
    });
  }, [cameraState.height, colorMode, layers, quality.maxAircraftModels, selectedFlight?.id, viewer, visibleFlights]);

  useEffect(() => {
    if (!viewer || !layers.satellites || cameraState.height < 900_000) return;
    return installSatellitePreview(viewer, cameraState.height);
  }, [cameraState.height, layers.satellites, viewer]);

  useEffect(() => {
    if (!viewer) return;
    return installFlightSelection(viewer, selectedFlight, colorMode, cameraState.height);
  }, [cameraState.height, colorMode, selectedFlight, viewer]);

  useEffect(() => {
    if (!viewer) return;
    viewer.scene.globe.enableLighting = nightLighting;
    viewer.scene.requestRender();
  }, [nightLighting, viewer]);

  useEffect(() => {
    if (!viewer) return;
    const clickHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((event: {position: {x: number; y: number}}) => {
      const picked = viewer.scene.pick(event.position) as {id?: unknown} | undefined;
      if (isFlightRecord(picked?.id)) onFlightClick(picked.id);
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => clickHandler.destroy();
  }, [onFlightClick, viewer]);

  const trackedFlightId = trackedFlight?.id ?? null;
  useEffect(() => {
    if (!viewer || !trackedFlight) return;
    const target = Cartesian3.fromDegrees(
        trackedFlight.longitude,
        trackedFlight.latitude,
        Math.max(20, trackedFlight.altitude),
      );
    viewer.camera.lookAt(
      target,
      new HeadingPitchRange(
        CesiumMath.toRadians(trackedFlight.heading + 180),
        CesiumMath.toRadians(-22),
        18_000,
      ),
    );
    // Cesium's local target frame is useful for computing the view, but the
    // standard Earth controls expect the global frame afterwards.
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    viewer.scene.requestRender();
    // Tracking is a lock, so follow each position update without replaying an
    // animated fly-to that would fight the user's camera every second.
  }, [
    terrainState,
    trackedFlight?.altitude,
    trackedFlight?.heading,
    trackedFlight?.latitude,
    trackedFlight?.longitude,
    trackedFlightId,
    viewer,
  ]);

  const zoomCamera = (inward: boolean) => {
    if (!viewer) return;
    const height = viewer.camera.positionCartographic.height;
    const amount = Math.max(500, height * (inward ? 0.38 : 0.55));
    if (inward) viewer.camera.zoomIn(amount);
    else viewer.camera.zoomOut(amount);
    const state = readEarthCamera(viewer);
    setCameraState(state);
    onViewStateChange(state);
    viewer.scene.requestRender();
  };

  return (
    <div
      className="map-surface"
      data-engine="cesium"
      data-mode={mode}
      data-polar-coverage="full"
      data-basemap-coverage={effectiveMapStyle === 'satellite-global'
        ? 'global-detail'
        : effectiveMapStyle === mapStyle
          ? 'detail'
          : Math.abs(cameraState.latitude) >= POLAR_BASEMAP_LATITUDE
            ? 'polar-safe'
            : 'orbital-safe'}
      data-terrain={terrainState}
      data-aircraft-lod={aircraftLodForHeight(cameraState.height)}
      data-satellite-render-mode={layers.satellites
        ? cameraState.height >= 900_000 ? 'models' : 'hidden-atmosphere'
        : 'hidden'}
      data-satellite-count={layers.satellites ? 18 : 0}
      data-selected-aircraft-model={Boolean(
        selectedFlight && cameraState.height < 12_000_000,
      )}
      data-zoom={cameraState.zoom.toFixed(3)}
      data-camera-height={cameraState.height.toFixed(0)}
      data-longitude={cameraState.longitude.toFixed(5)}
      data-latitude={cameraState.latitude.toFixed(5)}
      data-heading={cameraState.heading.toFixed(2)}
      data-pitch={cameraState.pitch.toFixed(2)}
    >
      <div ref={containerRef} className="cesium-container" aria-label={t('controls.globe')} />
      <div className="globe-vignette" aria-hidden="true" />
      <div className="camera-hint">{t('controls.tiltHint')}</div>
      <MapControls
        onZoomIn={() => zoomCamera(true)}
        onZoomOut={() => zoomCamera(false)}
        onResetView={() => viewer && resetEarthCamera(viewer)}
        nightMode={nightLighting}
        onToggleNight={() => setNightLighting((value) => !value)}
        t={t}
      />
    </div>
  );
}
