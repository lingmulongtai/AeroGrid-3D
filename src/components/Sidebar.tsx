import {
  ChevronDown, ChevronUp, CloudRain, Languages, MapPin, Plane, RefreshCw, Route, Satellite, Tags, Ship, Camera,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { AppMode } from '../../shared/contracts';
import type { Locale, Translator } from '../i18n';
import type { LayerKey, LayerVisibility } from '../types/layers';
import type { ColorMode, MapStyle } from './Map';

interface SidebarProps {
  mode: AppMode;
  locale: Locale;
  layers: LayerVisibility;
  counts: { aircraft: number; satellites: number; airports: number };
  colorMode: ColorMode;
  mapStyle: MapStyle;
  weatherOpacity: number;
  onToggleLayer: (key: LayerKey) => void;
  onModeChange: (mode: AppMode) => void;
  onLocaleChange: (locale: Locale) => void;
  onColorModeChange: (mode: ColorMode) => void;
  onMapStyleChange: (style: MapStyle) => void;
  onWeatherOpacityChange: (opacity: number) => void;
  onLoadArea: () => void;
  defaultCollapsed: boolean;
  t: Translator;
  sourceDetails: Record<'satellites' | 'weather' | 'ships' | 'cameras', string>;
  sourceNotes: string[];
}

const STORAGE_KEY = 'aerogrid.sidebar.collapsed';

export function Sidebar({
  mode, locale, layers, counts, colorMode, mapStyle, weatherOpacity,
  onToggleLayer, onModeChange, onLocaleChange, onColorModeChange, onMapStyleChange,
  onWeatherOpacityChange, onLoadArea, defaultCollapsed, t, sourceDetails, sourceNotes,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? defaultCollapsed : stored === 'true';
  });
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);
  const number = new Intl.NumberFormat(locale === 'ja' ? 'ja-JP' : 'en-US');

  return (
    <aside className="atlas-sidebar" data-collapsed={collapsed} aria-label={t('controls.layers')}>
      <div className="sidebar-header">
        <span className="brand-symbol" aria-hidden="true"><Plane /></span>
        <span className="brand-text"><strong>{t('app.name')}</strong><small>{t('app.tagline')}</small></span>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('controls.expandPanel') : t('controls.collapsePanel')}
          title={collapsed ? t('controls.expandPanel') : t('controls.collapsePanel')}
        >
          {collapsed ? <ChevronDown /> : <ChevronUp />}
        </button>
      </div>

      <div className="sidebar-body" aria-hidden={collapsed}>
        <div className="sidebar-scroll">
          <PanelGroup label={t('controls.layers')}>
            <div className="layer-list">
              <LayerToggle icon={<Plane />} label={t('controls.flights')} detail={number.format(counts.aircraft)} active={layers.flights} onClick={() => onToggleLayer('flights')} tone="amber" />
              <LayerToggle icon={<Satellite />} label={t('controls.satellites')} detail={`${number.format(counts.satellites)} · ${sourceDetails.satellites}`} active={layers.satellites} onClick={() => onToggleLayer('satellites')} tone="cyan" />
              <LayerToggle icon={<CloudRain />} label={t('controls.weather')} detail={sourceDetails.weather} active={layers.weather} onClick={() => onToggleLayer('weather')} tone="blue" />
              {mode === 'live-beta' && <>
                <LayerToggle icon={<Ship />} label={t('data.ships')} detail={sourceDetails.ships} active={layers.ships} onClick={() => onToggleLayer('ships')} tone="cyan" />
                <LayerToggle icon={<Camera />} label={t('data.cameras')} detail={sourceDetails.cameras} active={layers.cameras} onClick={() => onToggleLayer('cameras')} tone="neutral" />
              </>}
              <LayerToggle icon={<MapPin />} label={t('controls.airports')} detail={number.format(counts.airports)} active={layers.airports} onClick={() => onToggleLayer('airports')} tone="teal" />
              <LayerToggle icon={<Route />} label={t('controls.trails')} active={layers.flightTrails} onClick={() => onToggleLayer('flightTrails')} tone="amber" />
              <LayerToggle icon={<Route />} label={t('settings.trails')} active={layers.satelliteTrails} onClick={() => onToggleLayer('satelliteTrails')} tone="cyan" />
              <LayerToggle icon={<Tags />} label={t('controls.labels')} active={layers.labels} onClick={() => onToggleLayer('labels')} tone="neutral" />
            </div>
          </PanelGroup>

          <PanelGroup label={t('controls.map')}>
            <Segmented
              options={[['satellite', t('controls.satellite')], ['dark', t('controls.dark')], ['night', t('controls.night')]]}
              value={mapStyle}
              onChange={(value) => onMapStyleChange(value as MapStyle)}
            />
          </PanelGroup>

          <PanelGroup label={t('controls.color')}>
            <Segmented
              options={[['altitude', t('controls.altitude')], ['speed', t('controls.speed')], ['category', t('controls.category')]]}
              value={colorMode}
              onChange={(value) => onColorModeChange(value as ColorMode)}
            />
            <div className={`color-legend color-legend-${colorMode}`} aria-hidden="true" />
          </PanelGroup>

          <PanelGroup label={t('controls.opacity')}>
            <input
              className="opacity-slider"
              type="range"
              min="0.2"
              max="1"
              step="0.05"
              value={weatherOpacity}
              onChange={(event) => onWeatherOpacityChange(Number(event.target.value))}
              aria-label={t('controls.opacity')}
            />
          </PanelGroup>

          <PanelGroup label={t('controls.mode')}>
            <Segmented options={[['demo', t('mode.demo')], ['live-beta', t('mode.live')]]} value={mode} onChange={(value) => onModeChange(value as AppMode)} />
            {mode === 'live-beta' && (
              <button type="button" className="load-area-button" onClick={onLoadArea}>
                <RefreshCw /> {t('controls.refresh')}
              </button>
            )}
          </PanelGroup>

          <PanelGroup label={t('controls.language')} icon={<Languages />}>
            <Segmented options={[['en', 'English'], ['ja', '日本語']]} value={locale} onChange={(value) => onLocaleChange(value as Locale)} />
          </PanelGroup>

          {mode === 'live-beta' && <details className="source-details"><summary>{t('data.sourceDetails')}</summary>{sourceNotes.map((note, i) => <p key={i}>{note}</p>)}</details>}
          <p className="sidebar-note">{mode === 'demo' ? t('controls.spaceBody') : t('data.liveBody')}</p>
        </div>
      </div>
    </aside>
  );
}

function PanelGroup({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return <section className="panel-group"><h2>{icon}{label}</h2>{children}</section>;
}

function LayerToggle({ icon, label, detail, active, onClick, tone }: {
  icon: ReactNode;
  label: string;
  detail?: string;
  active: boolean;
  onClick: () => void;
  tone: 'amber' | 'cyan' | 'blue' | 'teal' | 'neutral';
}) {
  return (
    <button type="button" className="layer-toggle" data-tone={tone} aria-pressed={active} onClick={onClick}>
      <span className="layer-icon">{icon}</span>
      <span className="layer-text"><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
      <span className="layer-switch" aria-hidden="true"><span /></span>
    </button>
  );
}

function Segmented({ options, value, onChange }: {
  options: Array<[string, string]>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented-control">
      {options.map(([optionValue, label]) => (
        <button key={optionValue} type="button" aria-pressed={value === optionValue} onClick={() => onChange(optionValue)}>{label}</button>
      ))}
    </div>
  );
}
