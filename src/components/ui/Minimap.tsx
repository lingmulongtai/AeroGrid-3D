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
    const path = cameraFootprint.length > 2 ? [...cameraFootprint, cameraFootprint[0]] : cameraFootprint;

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
        getWidth: 2,
        widthUnits: 'pixels',
      }),
    ];
  }, [cameraFootprint, mainViewState.latitude, mainViewState.longitude, mapStyle]);

  return (
    <div
      className="absolute bottom-4 right-4 z-30 hidden h-52 w-52 overflow-hidden rounded-full border border-cyan-400/40 shadow-[0_0_30px_rgba(0,0,0,0.5)] sm:block"
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
