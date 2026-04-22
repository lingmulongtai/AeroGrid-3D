import { useState, useMemo, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { _GlobeView as GlobeView, LightingEffect, AmbientLight, DirectionalLight } from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer, ScatterplotLayer, GeoJsonLayer } from '@deck.gl/layers';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';

import { useFlightData } from '../hooks/useFlightData';
import { useSatelliteData } from '../hooks/useSatelliteData';
import { useWeatherData } from '../hooks/useWeatherData';

// Generic airplane model for demo
const AIRPLANE_MODEL = 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/scenegraph-layer/airplane.glb';

// Using a more reliable tile provider format
const TILES = [
  'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
  'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
  'https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png'
];

const LIGHTING = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.0 }),
  dir: new DirectionalLight({ color: [255, 255, 255], intensity: 2.0, direction: [-1, -4, -1] })
});

interface MapProps {
  showFlights: boolean;
  showSatellites: boolean;
  showWeather: boolean;
}

const INITIAL_VIEW_STATE = {
  longitude: 139,
  latitude: 35,
  zoom: 1,
  pitch: 0,
  bearing: 0
};

export default function EarthMap({ showFlights, showSatellites, showWeather }: MapProps) {
  const [viewState, setViewState] = useState<any>(INITIAL_VIEW_STATE);
  
  const { flights } = useFlightData(showFlights);
  const { satellites } = useSatelliteData(showSatellites);
  const { radarTileUrl } = useWeatherData(showWeather);

  const layers = useMemo(() => {
    const list: any[] = [
      // Base Map Tiles
      new TileLayer({
        id: 'basemap-tiles',
        data: TILES,
        minZoom: 0,
        maxZoom: 19,
        tileSize: 256,
        renderSubLayers: (props: any) => {
          const { west, south, east, north } = props.tile.bbox;
          return new BitmapLayer(props as any, {
            data: null,
            image: props.data,
            bounds: [west, south, east, north]
          } as any);
        }
      })
    ];

    if (showWeather && radarTileUrl) {
      list.push(
        new TileLayer({
          id: 'weather-radar',
          data: radarTileUrl,
          minZoom: 0,
          maxZoom: 12,
          tileSize: 256,
          renderSubLayers: (props: any) => {
            const { west, south, east, north } = props.tile.bbox;
            return new BitmapLayer(props as any, {
              data: null,
              image: props.data,
              bounds: [west, south, east, north],
              opacity: 0.7
            } as any);
          }
        })
      );
    }

    if (showSatellites && satellites.length > 0) {
      list.push(
        new ScatterplotLayer({
          id: 'satellites',
          data: satellites,
          getPosition: (d: any) => [d.longitude, d.latitude, d.altitude],
          getFillColor: [0, 200, 255, 200],
          getRadius: 30000,
          radiusMinPixels: 2,
          pickable: true,
        })
      );
    }

    if (showFlights && flights.length > 0) {
      // Small dots for visibility from distance
      list.push(
        new ScatterplotLayer({
          id: 'flight-points',
          data: flights,
          getPosition: (d: any) => [d.longitude, d.latitude, d.altitude],
          getFillColor: [255, 200, 0, 220],
          getRadius: 15000,
          radiusMinPixels: 3,
          pickable: true
        })
      );

      // 3D Airplane models
      list.push(
        new ScenegraphLayer({
          id: 'flight-models',
          data: flights,
          scenegraph: AIRPLANE_MODEL,
          getPosition: (d: any) => [d.longitude, d.latitude, d.altitude],
          getOrientation: (d: any) => [0, -d.heading, 90],
          sizeScale: 30,
          _lighting: 'pbr',
          getScale: (d: any) => d.modelType === 'large' ? [2.5, 2.5, 2.5] : [1.2, 1.2, 1.2],
          pickable: true,
          transitions: { getPosition: 15000 }
        })
      );
    }

    return list;
  }, [flights, satellites, radarTileUrl, showFlights, showSatellites, showWeather]);

  return (
    <div className="absolute inset-0 bg-[#050505]">
      <DeckGL
        views={new GlobeView({ id: 'globe', resolution: 2 })}
        viewState={viewState}
        onViewStateChange={({ viewState }) => setViewState(viewState)}
        controller={true}
        layers={layers}
        effects={[LIGHTING]}
        getTooltip={({ object }: any) => {
          if (!object) return null;
          if (object.callsign) return `Flight: ${object.callsign}\nAlt: ${Math.round(object.altitude)}m`;
          if (object.name) return `Satellite: ${object.name}`;
          return null;
        }}
      />
    </div>
  );
}


