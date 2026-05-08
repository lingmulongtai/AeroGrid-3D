import { memo, useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { _GlobeView as GlobeView } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { createBasemapLayer, type MapStyle } from '../layers/basemapLayer';
import type { QualitySettings } from '../../types/quality';

interface MinimapProps {
  mainViewState: { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number };
  cameraFootprint: [number, number][];
  mapStyle: MapStyle;
}

type MiniCenter = { lon: number; lat: number };
type MiniPath = { path: [number, number][] };
const MINI_QUALITY: QualitySettings = {
  preset: 'low',
  dpr: 1,
  maxFlights: 0,
  maxSatellites: 0,
  weatherParticles: 0,
  globeResolution: 4,
  tileCacheScale: 0.5,
  motionFps: 0,
};

export const Minimap = memo(function Minimap({ mainViewState, cameraFootprint, mapStyle }: MinimapProps) {
  const miniState = useMemo(
    () => ({
      longitude: mainViewState.longitude,
      latitude: mainViewState.latitude,
      zoom: 0.2,
      pitch: 0,
      bearing: 0,
    }),
    [mainViewState],
  );

  const layers = useMemo(() => {
    const path = normalizeFootprintPath(cameraFootprint, mainViewState.longitude);

    return [
      createBasemapLayer(mapStyle, MINI_QUALITY),
      new ScatterplotLayer({
        id: 'mini-center',
        data: [{ lon: mainViewState.longitude, lat: mainViewState.latitude }],
        getPosition: (d: MiniCenter) => [d.lon, d.lat, 0],
        getFillColor: [0, 220, 255, 220],
        getRadius: 140000,
        radiusMinPixels: 3,
      }),
      new PathLayer({
        id: 'mini-indicator',
        data: path.length > 2 ? [{ path }] : [],
        getPath: (d: MiniPath) => d.path,
        getColor: [0, 220, 255, 220],
        getWidth: 2.5,
        widthUnits: 'pixels',
        jointRounded: true,
        capRounded: true,
        pickable: false,
      }),
    ];
  }, [cameraFootprint, mainViewState.latitude, mainViewState.longitude, mapStyle]);

  return (
    <div
      className="absolute right-4 bottom-4 w-52 h-52 rounded-full overflow-hidden border border-cyan-400/40 z-30 shadow-[0_0_30px_rgba(0,0,0,0.5)]"
      style={{ background: 'radial-gradient(circle at 30% 20%, #153b62 0%, #071628 55%, #03060d 100%)' }}
    >
      <DeckGL
        views={new GlobeView({ id: 'mini', resolution: 4 })}
        viewState={miniState}
        controller={false}
        layers={layers}
        useDevicePixels={1}
      />
    </div>
  );
});

function normalizeFootprintPath(points: [number, number][], centerLon: number): [number, number][] {
  if (points.length < 3) return [];

  const clean = points
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 86)
    .map(([lon, lat]) => [unwrapLon(lon, centerLon), Math.max(-85, Math.min(85, lat))] as [number, number]);

  if (clean.length < 3) return [];

  const lons = clean.map(([lon]) => lon);
  const lats = clean.map(([, lat]) => lat);
  const lonSpan = Math.max(...lons) - Math.min(...lons);
  const latSpan = Math.max(...lats) - Math.min(...lats);

  if (lonSpan > 150 || latSpan > 95) return [];

  const wrapped = clean.map(([lon, lat]) => [wrapLon(lon), lat] as [number, number]);
  return [...wrapped, wrapped[0]];
}

function unwrapLon(lon: number, centerLon: number): number {
  let value = lon;
  while (value - centerLon > 180) value -= 360;
  while (centerLon - value > 180) value += 360;
  return value;
}

function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
