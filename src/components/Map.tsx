import { useState, useMemo, useEffect, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import {
  _GlobeView as GlobeView,
  MapView,
  LightingEffect,
  AmbientLight,
  DirectionalLight,
} from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer, ScatterplotLayer, PathLayer, TextLayer } from '@deck.gl/layers';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';

import type { Flight } from '../hooks/useFlightData';
import type { SatelliteInfo, SatelliteGroup } from '../hooks/useSatelliteData';
import { SATELLITE_COLORS, SATELLITE_RADII, SATELLITE_MIN_PIXELS } from '../hooks/useSatelliteData';
import { MAJOR_AIRPORTS, type Airport } from '../data/airports';
import { getFlightColor, getCategoryScale, getCategorySizeScale, type AircraftCategory } from '../utils/flightUtils';
import type { SelectedObject } from './FlightInfoPanel';
import { MapControls } from './MapControls';

const AIRPLANE_MODEL = 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/scenegraph-layer/airplane.glb';

const TILE_URLS: Record<string, string[]> = {
  dark: [
    'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
    'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
    'https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
  ],
  light: [
    'https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png',
    'https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png',
  ],
  satellite: [
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ],
};

const AIRCRAFT_GROUPS: { id: string; categories: AircraftCategory[] }[] = [
  { id: 'heavy', categories: ['heavy', 'large'] },
  { id: 'medium', categories: ['medium', 'unknown'] },
  { id: 'light', categories: ['small', 'light', 'helicopter'] },
];

function makeLighting(nightMode: boolean) {
  return new LightingEffect({
    ambient: new AmbientLight({
      color: [255, 255, 255],
      intensity: nightMode ? 0.2 : 1.0,
    }),
    dir: new DirectionalLight({
      color: [255, 240, 200],
      intensity: nightMode ? 0.5 : 2.0,
      direction: [-1, -3, -1],
    }),
  });
}

const INITIAL_VIEW_STATE = {
  longitude: 139,
  latitude: 35,
  zoom: 1.2,
  pitch: 0,
  bearing: 0,
  minZoom: 0,
  maxZoom: 15,
};

export type ColorMode = 'altitude' | 'speed' | 'category';
export type MapStyle = 'dark' | 'light' | 'satellite';
export type ProjectionMode = 'globe' | 'map';

interface MapProps {
  showFlights: boolean;
  showSatellites: boolean;
  showWeather: boolean;
  showAirports: boolean;
  showTrails: boolean;
  showLabels: boolean;
  colorMode: ColorMode;
  mapStyle: MapStyle;
  projection: ProjectionMode;
  onProjectionChange: (p: ProjectionMode) => void;
  flights: Flight[];
  satellites: SatelliteInfo[];
  activeGroups: Set<SatelliteGroup>;
  radarTileUrl: string | null;
  selectedObject: SelectedObject;
  trackedObject: SelectedObject;
  onFlightClick: (f: Flight) => void;
  onSatelliteClick: (s: SatelliteInfo) => void;
  onAirportClick: (a: Airport) => void;
}

export default function EarthMap({
  showFlights, showSatellites, showWeather, showAirports,
  showTrails, showLabels,
  colorMode, mapStyle, projection, onProjectionChange,
  flights, satellites, activeGroups,
  radarTileUrl,
  selectedObject, trackedObject,
  onFlightClick, onSatelliteClick, onAirportClick,
}: MapProps) {
  const [viewState, setViewState] = useState<any>(INITIAL_VIEW_STATE);
  const [nightMode, setNightMode] = useState(false);
  const [pulseAlpha, setPulseAlpha] = useState(220);

  // Pulse animation for selected object
  useEffect(() => {
    const id = setInterval(() => {
      setPulseAlpha(a => a > 80 ? a - 15 : 220);
    }, 80);
    return () => clearInterval(id);
  }, []);

  // Track selected / tracked object
  useEffect(() => {
    if (!trackedObject) return;
    const target = trackedObject.type === 'flight' ? trackedObject.data :
                   trackedObject.type === 'satellite' ? trackedObject.data : null;
    if (!target) return;
    setViewState((prev: any) => ({
      ...prev,
      longitude: target.longitude,
      latitude: target.latitude,
      transitionDuration: 1200,
    }));
  }, [flights, satellites, trackedObject]);

  const lighting = useMemo(() => makeLighting(nightMode), [nightMode]);

  const view = useMemo(() => {
    if (projection === 'globe') {
      return new GlobeView({ id: 'globe', resolution: 2 });
    }
    return new MapView({ id: 'map', controller: true });
  }, [projection]);

  const tileUrls = useMemo(() => TILE_URLS[mapStyle] ?? TILE_URLS.dark, [mapStyle]);

  const handleZoomIn = useCallback(() => {
    setViewState((prev: any) => ({ ...prev, zoom: Math.min((prev.zoom ?? 1) + 1, 15) }));
  }, []);
  const handleZoomOut = useCallback(() => {
    setViewState((prev: any) => ({ ...prev, zoom: Math.max((prev.zoom ?? 1) - 1, 0) }));
  }, []);
  const handleReset = useCallback(() => {
    setViewState(INITIAL_VIEW_STATE);
  }, []);

  const layers = useMemo(() => {
    const list: any[] = [];

    // 1. Basemap tiles
    list.push(
      new TileLayer({
        id: 'basemap',
        data: tileUrls,
        minZoom: 0,
        maxZoom: 19,
        tileSize: 256,
        renderSubLayers: (props: any) => {
          const { west, south, east, north } = props.tile.bbox;
          return new BitmapLayer(props, {
            data: null,
            image: props.data,
            bounds: [west, south, east, north],
          } as any);
        },
      })
    );

    // 2. Weather radar overlay
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
            return new BitmapLayer(props, {
              data: null,
              image: props.data,
              bounds: [west, south, east, north],
              opacity: 0.65,
            } as any);
          },
        })
      );
    }

    // 3. Airport markers
    if (showAirports) {
      list.push(
        new ScatterplotLayer<Airport>({
          id: 'airports',
          data: MAJOR_AIRPORTS,
          getPosition: d => [d.longitude, d.latitude, 0],
          getFillColor: [255, 255, 255, 160],
          getRadius: 6000,
          radiusMinPixels: 3,
          radiusMaxPixels: 10,
          pickable: true,
          onClick: ({ object }: any) => object && onAirportClick(object),
          stroked: true,
          lineWidthMinPixels: 1,
          getLineColor: [255, 255, 255, 80],
          getLineWidth: 500,
        })
      );
    }

    // 4. Airport IATA labels
    if (showAirports && showLabels) {
      list.push(
        new TextLayer<Airport>({
          id: 'airport-labels',
          data: MAJOR_AIRPORTS,
          getPosition: d => [d.longitude, d.latitude, 0],
          getText: d => d.iata,
          getSize: 11,
          getColor: [255, 255, 255, 180],
          getAngle: 0,
          billboard: true,
          fontFamily: 'Inter, monospace',
          fontWeight: '600',
          getPixelOffset: [0, -14],
          pickable: false,
        })
      );
    }

    // 5. Flight trails
    if (showFlights && showTrails) {
      const trailFlights = flights.filter(f => f.positionHistory.length > 1);
      list.push(
        new PathLayer<Flight>({
          id: 'flight-trails',
          data: trailFlights,
          getPath: d => d.positionHistory as [number, number, number][],
          getColor: d => {
            const c = getFlightColor(colorMode, d.altitude, d.velocity, d.category);
            return [c[0], c[1], c[2], 100];
          },
          getWidth: 2,
          widthMinPixels: 1,
          widthUnits: 'pixels',
          jointRounded: true,
          capRounded: true,
          pickable: false,
        })
      );
    }

    // 6. Flight dots (always visible, fast rendering)
    if (showFlights && flights.length > 0) {
      list.push(
        new ScatterplotLayer<Flight>({
          id: 'flight-dots',
          data: flights,
          getPosition: d => [d.longitude, d.latitude, d.altitude],
          getFillColor: d => getFlightColor(colorMode, d.altitude, d.velocity, d.category),
          getRadius: 12000,
          radiusMinPixels: 2,
          radiusMaxPixels: 8,
          pickable: true,
          onClick: ({ object }: any) => object && onFlightClick(object),
        })
      );
    }

    // 7–9. 3D Aircraft models — one layer per category group
    if (showFlights && flights.length > 0) {
      AIRCRAFT_GROUPS.forEach(({ id, categories }) => {
        const groupFlights = flights.filter(f => categories.includes(f.category));
        if (groupFlights.length === 0) return;

        const representative = categories[0];
        list.push(
          new ScenegraphLayer<Flight>({
            id: `aircraft-${id}`,
            data: groupFlights,
            scenegraph: AIRPLANE_MODEL,
            getPosition: d => [d.longitude, d.latitude, d.altitude],
            getOrientation: d => [0, -d.heading, 90],
            sizeScale: getCategorySizeScale(representative),
            getScale: d => getCategoryScale(d.category),
            _lighting: 'pbr',
            pickable: true,
            onClick: ({ object }: any) => object && onFlightClick(object),
            transitions: { getPosition: 15000 },
          })
        );
      });
    }

    // 10. Satellite layers per group
    if (showSatellites && satellites.length > 0) {
      const groups: SatelliteGroup[] = ['stations', 'starlink', 'weather', 'gps', 'active'];
      for (const group of groups) {
        if (group !== 'stations' && !activeGroups.has(group)) continue;
        const groupSats = satellites.filter(s => s.group === group);
        if (groupSats.length === 0) continue;

        list.push(
          new ScatterplotLayer<SatelliteInfo>({
            id: `satellites-${group}`,
            data: groupSats,
            getPosition: d => [d.longitude, d.latitude, d.altitude],
            getFillColor: SATELLITE_COLORS[group],
            getRadius: SATELLITE_RADII[group],
            radiusMinPixels: SATELLITE_MIN_PIXELS[group],
            radiusMaxPixels: group === 'stations' ? 16 : 8,
            pickable: true,
            onClick: ({ object }: any) => object && onSatelliteClick(object),
          })
        );
      }
    }

    // 11. ISS special label
    if (showSatellites && showLabels) {
      const iss = satellites.filter(s => s.isISS);
      if (iss.length > 0) {
        list.push(
          new TextLayer<SatelliteInfo>({
            id: 'iss-labels',
            data: iss,
            getPosition: d => [d.longitude, d.latitude, d.altitude],
            getText: d => d.name.toUpperCase().includes('ISS') ? '🛸 ISS' : d.name,
            getSize: 12,
            getColor: [50, 255, 100, 220],
            billboard: true,
            fontFamily: 'Inter, monospace',
            fontWeight: '700',
            getPixelOffset: [0, -16],
            pickable: false,
          })
        );
      }
    }

    // 12. Selected object highlight (pulsing ring)
    if (selectedObject) {
      const obj = selectedObject.type === 'flight' ? selectedObject.data :
                  selectedObject.type === 'satellite' ? selectedObject.data : null;
      if (obj) {
        list.push(
          new ScatterplotLayer({
            id: 'selected-highlight',
            data: [obj],
            getPosition: (d: any) => [d.longitude, d.latitude, d.altitude ?? 0],
            getFillColor: [255, 255, 255, 0],
            getRadius: selectedObject.type === 'satellite' ? 80000 : 30000,
            radiusMinPixels: 10,
            stroked: true,
            lineWidthMinPixels: 2,
            getLineColor: [255, 255, 255, pulseAlpha],
            getLineWidth: 3000,
            pickable: false,
          })
        );
      }
    }

    return list;
  }, [
    flights, satellites, activeGroups, radarTileUrl, tileUrls,
    showFlights, showSatellites, showWeather, showAirports, showTrails, showLabels,
    colorMode, selectedObject, onFlightClick, onSatelliteClick, onAirportClick,
    pulseAlpha,
  ]);

  const getTooltip = useCallback(({ object }: any) => {
    if (!object) return null;
    if (object.callsign) {
      return {
        html: `<div class="deck-tooltip-content"><strong>${object.callsign}</strong><br/><span>${Math.round(object.velocity * 1.94384)} kt &nbsp;·&nbsp; ${Math.round(object.altitude).toLocaleString()} m</span></div>`,
        style: { background: 'none', border: 'none', padding: 0 },
      };
    }
    if (object.name && !object.callsign) {
      return {
        html: `<div class="deck-tooltip-content"><strong>${object.name}</strong><br/><span>${Math.round(object.altitude / 1000)} km orbit</span></div>`,
        style: { background: 'none', border: 'none', padding: 0 },
      };
    }
    if (object.iata) {
      return {
        html: `<div class="deck-tooltip-content"><strong>${object.iata}</strong> ${object.name}<br/><span>${object.city}, ${object.country}</span></div>`,
        style: { background: 'none', border: 'none', padding: 0 },
      };
    }
    return null;
  }, []);

  return (
    <div className="absolute inset-0 bg-[#050508]">
      <DeckGL
        views={view}
        viewState={viewState}
        onViewStateChange={({ viewState: vs }: any) => setViewState(vs)}
        controller={true}
        layers={layers}
        effects={[lighting]}
        getTooltip={getTooltip as any}
        onClick={({ object }: any) => {
          if (!object) return;
          if (object.callsign !== undefined) onFlightClick(object);
          else if (object.name && object.group) onSatelliteClick(object);
          else if (object.iata) onAirportClick(object);
        }}
      />

      <MapControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleReset}
        projection={projection}
        onToggleProjection={() => onProjectionChange(projection === 'globe' ? 'map' : 'globe')}
        nightMode={nightMode}
        onToggleNight={() => setNightMode(n => !n)}
      />
    </div>
  );
}
