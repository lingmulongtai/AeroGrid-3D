import { useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { _GlobeView as GlobeView } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';

interface MinimapProps {
  mainViewState: any;
  cameraFootprint: [number, number][];
}

export function Minimap({ mainViewState, cameraFootprint }: MinimapProps) {
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
      new ScatterplotLayer({
        id: 'mini-center',
        data: [{ lon: mainViewState.longitude, lat: mainViewState.latitude }],
        getPosition: (d: any) => [d.lon, d.lat, 0],
        getFillColor: [0, 220, 255, 220],
        getRadius: 140000,
        radiusMinPixels: 3,
      }),
      new PathLayer({
        id: 'mini-indicator',
        data: path.length > 2 ? [{ path }] : [],
        getPath: (d: any) => d.path,
        getColor: [0, 220, 255, 220],
        getWidth: 2,
        widthUnits: 'pixels',
      }),
    ];
  }, [cameraFootprint, mainViewState.latitude, mainViewState.longitude]);

  return (
    <div className="absolute right-4 bottom-4 w-52 h-52 rounded-full overflow-hidden border border-cyan-400/40 z-30 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
      <DeckGL
        views={new GlobeView({ id: 'mini', resolution: 4 })}
        viewState={miniState}
        controller={false}
        layers={layers}
        useDevicePixels={1}
      />
    </div>
  );
}
