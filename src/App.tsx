import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { AppMode, RadiusCoverage } from '../shared/contracts';
import { AtlasHeader } from './components/AtlasHeader';
import { EarthMap, type ColorMode, type GlobeViewState, type MapStyle, type PickResult, type Selection } from './components/Map';
import { FlightInfoPanel } from './components/FlightInfoPanel';
import { AirportPanel, SatellitePanel } from './components/ObjectPanels';
import { SearchBar, type SearchResult } from './components/SearchBar';
import { SettingsDialog } from './components/SettingsDialog';
import { Sidebar } from './components/Sidebar';
import { WelcomeDialog } from './components/WelcomeDialog';
import { loadRegionalAirports, MAJOR_AIRPORTS, type Airport } from './data/airports';
import { buildConstellation, constellationFromElements } from './data/satellites';
import { usePublicLayers } from './hooks/usePublicLayers';
import type { GlobeEngine } from './globe/engine';
import { useAtlasData } from './hooks/useAtlasData';
import { demoRouteFor } from './hooks/useFlightData';
import { translate, type Locale } from './i18n';
import { DEFAULT_LAYERS, type LayerKey, type LayerVisibility } from './types/layers';
import { loadQuality, QUALITY_PRESETS, saveQuality, type QualitySettings } from './types/quality';

const INITIAL_CENTER = { latitude: 35.68, longitude: 139.76 };

function storedMode(): AppMode | null {
  const value = window.localStorage.getItem('aerogrid.mode');
  return value === 'demo' || value === 'live-beta' ? value : null;
}

function storedLocale(): Locale {
  return window.localStorage.getItem('aerogrid.locale') === 'ja' ? 'ja' : 'en';
}

function storedMapStyle(): MapStyle {
  const value = window.localStorage.getItem('aerogrid.mapStyle');
  return value === 'dark' || value === 'night' ? value : 'satellite';
}

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return mobile;
}

function defaultQuality(): QualitySettings {
  if (import.meta.env.VITE_E2E === 'true') return QUALITY_PRESETS.low;
  const mobile = window.matchMedia('(max-width: 700px)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mobile) return QUALITY_PRESETS.low;
  if (cores <= 4) return QUALITY_PRESETS.medium;
  return QUALITY_PRESETS.high;
}

export function App() {
  const [locale, setLocale] = useState<Locale>(storedLocale);
  const [mode, setMode] = useState<AppMode | null>(storedMode);
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [colorMode, setColorMode] = useState<ColorMode>('altitude');
  const [mapStyle, setMapStyle] = useState<MapStyle>(storedMapStyle);
  const [weatherOpacity, setWeatherOpacity] = useState(0.85);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tracked, setTracked] = useState<Selection | null>(null);
  const [viewCenter, setViewCenter] = useState(INITIAL_CENTER);
  const [coverage, setCoverage] = useState<RadiusCoverage>({ kind: 'radius', center: INITIAL_CENTER, radiusNm: 150 });
  const [refreshToken, setRefreshToken] = useState(0);
  const [quality, setQuality] = useState<QualitySettings>(() => loadQuality(defaultQuality()));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [airports, setAirports] = useState<Airport[]>(MAJOR_AIRPORTS);
  const engineRef = useRef<GlobeEngine | null>(null);
  const weatherRetryUrlRef = useRef('');
  const isMobile = useIsMobile();
  const t = useCallback((key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(locale, key, values), [locale]);

  useEffect(() => {
    void loadRegionalAirports().then((regional) => setAirports([...MAJOR_AIRPORTS, ...regional]));
  }, []);

  const { flightSnapshot, weatherSnapshot, flightStats, loading, refreshWeather } = useAtlasData({
    mode,
    coverage,
    flightsEnabled: layers.flights,
    weatherEnabled: layers.weather,
    demoFlightCount: quality.maxFlights,
    refreshToken,
  });

  const publicLayers = usePublicLayers(mode, coverage, layers, refreshToken);
  const satellites = useMemo(() => mode === 'live-beta' ? constellationFromElements(publicLayers.orbits.items, quality.maxSatellites) : buildConstellation(quality.maxSatellites), [mode, publicLayers.orbits.items, quality.maxSatellites]);
  const selectedFlight = useMemo(
    () => selection?.kind === 'aircraft' ? flightSnapshot.items.find((flight) => flight.id === selection.id) ?? null : null,
    [flightSnapshot.items, selection],
  );
  const selectedSatellite = selection?.kind === 'satellite' ? satellites.find((satellite) => satellite.id === selection.id) ?? null : null;
  const selectedAirport = selection?.kind === 'airport' ? airports.find((airport) => airport.iata === selection.id) ?? null : null;
  const radarTileUrl = mode === 'live-beta' && weatherSnapshot.status !== 'unavailable'
    ? weatherSnapshot.items[0]?.tileUrl ?? null
    : null;

  const updateQuality = useCallback((next: QualitySettings) => {
    saveQuality(next);
    setQuality(next);
  }, []);

  const updateLocale = useCallback((next: Locale) => {
    window.localStorage.setItem('aerogrid.locale', next);
    setLocale(next);
  }, []);

  const updateMapStyle = useCallback((next: MapStyle) => {
    window.localStorage.setItem('aerogrid.mapStyle', next);
    setMapStyle(next);
  }, []);

  const updateMode = useCallback((next: AppMode) => {
    window.localStorage.setItem('aerogrid.mode', next);
    setMode(next);
    setSelection(null);
    setTracked(null);
    if (next === 'live-beta') {
      setCoverage((previous) => ({ ...previous, center: viewCenter }));
      setRefreshToken((token) => token + 1);
    }
  }, [viewCenter]);

  const toggleLayer = useCallback((key: LayerKey) => {
    setLayers((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);

  const handlePick = useCallback((result: PickResult | null) => {
    if (!result) return;
    if (result.kind === 'airport') setSelection({ kind: 'airport', id: result.airport.iata });
    else setSelection({ kind: result.kind, id: result.id });
  }, []);

  const handleSearch = useCallback((result: SearchResult) => {
    if (result.kind === 'aircraft') {
      const next = { kind: 'aircraft' as const, id: result.flight.id };
      setSelection(next);
      setTracked(next);
    } else if (result.kind === 'satellite') {
      const next = { kind: 'satellite' as const, id: result.satellite.id };
      setSelection(next);
      setTracked(next);
    } else {
      setSelection({ kind: 'airport', id: result.airport.iata });
      setTracked(null);
      engineRef.current?.flyTo(result.airport.longitude, result.airport.latitude, 45, 50);
    }
  }, []);

  const handleViewStateChange = useCallback((viewState: GlobeViewState) => {
    setViewCenter((previous) => {
      if (Math.abs(previous.latitude - viewState.latitude) < 0.05 && Math.abs(previous.longitude - viewState.longitude) < 0.05) return previous;
      return { latitude: viewState.latitude, longitude: viewState.longitude };
    });
  }, []);

  const loadCurrentArea = useCallback(() => {
    setCoverage((previous) => ({ ...previous, center: viewCenter }));
    setRefreshToken((token) => token + 1);
  }, [viewCenter]);

  const handleWeatherTileError = useCallback(() => {
    if (!radarTileUrl || weatherRetryUrlRef.current === radarTileUrl) return;
    weatherRetryUrlRef.current = radarTileUrl;
    void refreshWeather();
  }, [radarTileUrl, refreshWeather]);

  const handleEngineReady = useCallback((engine: GlobeEngine | null) => {
    engineRef.current = engine;
  }, []);

  const readStats = useCallback(() => engineRef.current?.stats ?? null, []);
  const stopTracking = useCallback(() => setTracked(null), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const toggleTrack = (target: Selection) => setTracked((current) => (current?.kind === target.kind && current.id === target.id ? null : target));

  const weatherLabel = mode === 'demo'
    ? t('weather.demo')
    : weatherSnapshot.status === 'available' || weatherSnapshot.status === 'stale'
      ? t('weather.live', { value: new Date((weatherSnapshot.items[0]?.time ?? 0) * 1000).toLocaleTimeString(locale === 'ja' ? 'ja-JP' : 'en-US', { hour: '2-digit', minute: '2-digit' }) })
      : t('weather.unavailable');

  return (
    <main className="atlas-app">
      <EarthMap
        mode={mode ?? 'demo'}
        layers={layers}
        colorMode={colorMode}
        mapStyle={mapStyle}
        flights={flightSnapshot.items}
        snapshotTime={flightSnapshot.generatedAt}
        radarTileUrl={radarTileUrl}
        radarCenter={coverage.center}
        radarRadiusKm={coverage.radiusNm * 1.852}
        weatherOpacity={weatherOpacity}
        selection={selection}
        tracked={tracked}
        quality={quality}
        onPick={handlePick}
        onViewStateChange={handleViewStateChange}
        onWeatherTileError={handleWeatherTileError}
        onTrackingInterrupted={stopTracking}
        onOpenSettings={() => setSettingsOpen(true)}
        onEngineReady={handleEngineReady}
        satellites={satellites}
        cloudProfiles={publicLayers.clouds.items}
        t={t}
      />

      {mode && (
        <Sidebar
          mode={mode}
          locale={locale}
          layers={layers}
          counts={{ aircraft: flightStats.airborne, satellites: satellites.length, airports: airports.length }}
          colorMode={colorMode}
          mapStyle={mapStyle}
          weatherOpacity={weatherOpacity}
          onToggleLayer={toggleLayer}
          onModeChange={updateMode}
          onLocaleChange={updateLocale}
          onColorModeChange={setColorMode}
          onMapStyleChange={updateMapStyle}
          onWeatherOpacityChange={setWeatherOpacity}
          onLoadArea={loadCurrentArea}
          defaultCollapsed={isMobile}
          t={t}
        />
      )}
      {mode && <SearchBar flights={flightSnapshot.items} satellites={satellites} airports={airports} onSelect={handleSearch} t={t} />}
      {mode && <AtlasHeader mode={mode} snapshot={flightSnapshot} count={flightStats.airborne} loading={loading} locale={locale} t={t} />}

      <AnimatePresence>
        {selectedFlight && (
          <FlightInfoPanel
            key={`flight-${selectedFlight.id}`}
            flight={selectedFlight}
            route={demoRouteFor(selectedFlight)}
            tracked={tracked?.kind === 'aircraft' && tracked.id === selectedFlight.id}
            locale={locale}
            onClose={() => setSelection(null)}
            onToggleTrack={() => toggleTrack({ kind: 'aircraft', id: selectedFlight.id })}
            t={t}
          />
        )}
        {selectedSatellite && (
          <SatellitePanel
            key={`satellite-${selectedSatellite.id}`}
            satellite={selectedSatellite}
            tracked={tracked?.kind === 'satellite' && tracked.id === selectedSatellite.id}
            locale={locale}
            onClose={() => setSelection(null)}
            onToggleTrack={() => toggleTrack({ kind: 'satellite', id: selectedSatellite.id })}
            t={t}
          />
        )}
        {selectedAirport && (
          <AirportPanel
            key={`airport-${selectedAirport.iata}`}
            airport={selectedAirport}
            onClose={() => setSelection(null)}
            onFocus={() => engineRef.current?.flyTo(selectedAirport.longitude, selectedAirport.latitude, 30, 55)}
            t={t}
          />
        )}
      </AnimatePresence>

      {mode && (
        <footer className="atlas-footer">
          <span>{mode === 'demo'
            ? t('status.demoSource')
            : `${flightSnapshot.source} · ${t('status.coverage', { value: coverage.radiusNm })}${flightSnapshot.status === 'available' ? '' : ` · ${t(`status.reason.${flightSnapshot.status}` as 'status.reason.stale' | 'status.reason.rate-limited' | 'status.reason.unavailable')}`}`}</span>
          <span>{mode === 'demo' ? weatherLabel : `${t('data.forecast')} · ${publicLayers.clouds.items[0]?.validTime ?? publicLayers.clouds.status}`}</span>
          <span>{t('footer.attribution')}</span>
        </footer>
      )}

      {settingsOpen && (
        <SettingsDialog quality={quality} onChange={updateQuality} onClose={closeSettings} readStats={readStats} t={t} onDataChange={() => setRefreshToken((token) => token + 1)} />
      )}

      {!mode && <WelcomeDialog locale={locale} onLocaleChange={updateLocale} onSelectMode={updateMode} t={t} />}
    </main>
  );
}
