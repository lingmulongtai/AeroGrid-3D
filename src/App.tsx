import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { AppMode, FlightRecord, RadiusCoverage } from '../shared/contracts';
import { AtlasHeader } from './components/AtlasHeader';
import { ControlDock } from './components/ControlDock';
import { EarthMap, type ColorMode } from './components/Map';
import { FlightInfoPanel } from './components/FlightInfoPanel';
import { SearchBar } from './components/SearchBar';
import { WelcomeDialog } from './components/WelcomeDialog';
import type { GlobeViewState } from './components/camera/useAdvancedGlobeCamera';
import type { MapStyle } from './components/layers/basemapLayer';
import { useAtlasData } from './hooks/useAtlasData';
import { translate, type Locale } from './i18n';
import { DEFAULT_LAYERS, type LayerKey, type LayerVisibility } from './types/layers';
import { QUALITY_PRESETS } from './types/quality';

const LazyControlPanel = lazy(() => import('./components/ControlPanel').then((module) => ({ default: module.ControlPanel })));
const INITIAL_CENTER = { latitude: 35.68, longitude: 139.76 };

function storedMode(): AppMode | null {
  const value = window.localStorage.getItem('aerogrid.mode');
  return value === 'demo' || value === 'live-beta' ? value : null;
}

function storedLocale(): Locale {
  return window.localStorage.getItem('aerogrid.locale') === 'ja' ? 'ja' : 'en';
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

export function App() {
  const [locale, setLocale] = useState<Locale>(storedLocale);
  const [mode, setMode] = useState<AppMode | null>(storedMode);
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [colorMode, setColorMode] = useState<ColorMode>('altitude');
  const [mapStyle, setMapStyle] = useState<MapStyle>('dark');
  const [weatherOpacity, setWeatherOpacity] = useState(0.48);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [trackedFlightId, setTrackedFlightId] = useState<string | null>(null);
  const [viewCenter, setViewCenter] = useState(INITIAL_CENTER);
  const [coverage, setCoverage] = useState<RadiusCoverage>({ kind: 'radius', center: INITIAL_CENTER, radiusNm: 150 });
  const [refreshToken, setRefreshToken] = useState(0);
  const weatherRetryUrlRef = useRef('');
  const isMobile = useIsMobile();
  const quality = isMobile ? QUALITY_PRESETS.low : QUALITY_PRESETS.medium;
  const t = useCallback((key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(locale, key, values), [locale]);

  const { flightSnapshot, weatherSnapshot, flightStats, loading, refreshWeather } = useAtlasData({
    mode,
    coverage,
    flightsEnabled: layers.flights,
    weatherEnabled: layers.weather,
    demoFlightCount: isMobile ? 800 : 2000,
    refreshToken,
  });

  const trackedFlight = useMemo(
    () => trackedFlightId ? flightSnapshot.items.find((flight) => flight.id === trackedFlightId) ?? null : null,
    [flightSnapshot.items, trackedFlightId],
  );
  const selectedFlight = useMemo(
    () => selectedFlightId ? flightSnapshot.items.find((flight) => flight.id === selectedFlightId) ?? null : null,
    [flightSnapshot.items, selectedFlightId],
  );
  const radarTileUrl = mode === 'live-beta' && weatherSnapshot.status !== 'unavailable'
    ? weatherSnapshot.items[0]?.tileUrl ?? null
    : null;

  const updateLocale = useCallback((next: Locale) => {
    window.localStorage.setItem('aerogrid.locale', next);
    setLocale(next);
  }, []);

  const updateMode = useCallback((next: AppMode) => {
    window.localStorage.setItem('aerogrid.mode', next);
    setMode(next);
    setSelectedFlightId(null);
    setTrackedFlightId(null);
    if (next === 'live-beta') {
      setCoverage((previous) => ({ ...previous, center: viewCenter }));
      setRefreshToken((token) => token + 1);
    }
  }, [viewCenter]);

  const toggleLayer = useCallback((key: LayerKey) => {
    setLayers((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);
  const selectFlight = useCallback((flight: FlightRecord) => setSelectedFlightId(flight.id), []);

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
        radarTileUrl={radarTileUrl}
        weatherOpacity={weatherOpacity}
        selectedFlight={selectedFlight}
        trackedFlight={trackedFlight}
        quality={quality}
        onFlightClick={selectFlight}
        onViewStateChange={handleViewStateChange}
        onWeatherTileError={handleWeatherTileError}
        t={t}
      />

      {mode && <AtlasHeader mode={mode} snapshot={flightSnapshot} count={flightStats.airborne} loading={loading} locale={locale} t={t} />}
      {mode && <SearchBar flights={flightSnapshot.items} onSelect={selectFlight} t={t} />}
      {mode && <ControlDock layers={layers} panelOpen={panelOpen} onToggleLayer={toggleLayer} onTogglePanel={() => setPanelOpen((open) => !open)} t={t} />}

      <AnimatePresence>
        {selectedFlight && (
          <FlightInfoPanel
            flight={selectedFlight}
            tracked={trackedFlightId === selectedFlight.id}
            locale={locale}
            onClose={() => setSelectedFlightId(null)}
            onToggleTrack={() => setTrackedFlightId((id) => id === selectedFlight.id ? null : selectedFlight.id)}
            t={t}
          />
        )}
      </AnimatePresence>

      {panelOpen && mode && (
        <Suspense fallback={<div className="panel-loading" aria-live="polite">…</div>}>
          <LazyControlPanel
            mode={mode}
            locale={locale}
            colorMode={colorMode}
            mapStyle={mapStyle}
            weatherOpacity={weatherOpacity}
            onModeChange={updateMode}
            onLocaleChange={updateLocale}
            onColorModeChange={setColorMode}
            onMapStyleChange={setMapStyle}
            onWeatherOpacityChange={setWeatherOpacity}
            onLoadArea={loadCurrentArea}
            onClose={() => setPanelOpen(false)}
            t={t}
          />
        </Suspense>
      )}

      {mode && (
        <footer className="atlas-footer">
          <span>{mode === 'demo'
            ? t('status.demoSource')
            : `${t('status.liveSource')} · ${t('status.coverage', { value: coverage.radiusNm })}${flightSnapshot.status === 'available' ? '' : ` · ${t(`status.reason.${flightSnapshot.status}` as 'status.reason.stale' | 'status.reason.rate-limited' | 'status.reason.unavailable')}`}`}</span>
          <span>{weatherLabel}</span>
          <span>{t('footer.attribution')}</span>
        </footer>
      )}

      {!mode && <WelcomeDialog locale={locale} onLocaleChange={updateLocale} onSelectMode={updateMode} t={t} />}
    </main>
  );
}
