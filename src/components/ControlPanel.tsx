import { RefreshCw, Rocket, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AppMode } from '../../shared/contracts';
import type { ColorMode } from './Map';
import type { MapStyle } from './layers/basemapLayer';
import type { Locale, Translator } from '../i18n';

interface ControlPanelProps {
  mode: AppMode;
  locale: Locale;
  colorMode: ColorMode;
  mapStyle: MapStyle;
  weatherOpacity: number;
  onModeChange: (mode: AppMode) => void;
  onLocaleChange: (locale: Locale) => void;
  onColorModeChange: (mode: ColorMode) => void;
  onMapStyleChange: (style: MapStyle) => void;
  onWeatherOpacityChange: (opacity: number) => void;
  onLoadArea: () => void;
  onClose: () => void;
  t: Translator;
}

export function ControlPanel({
  mode, locale, colorMode, mapStyle, weatherOpacity,
  onModeChange, onLocaleChange, onColorModeChange, onMapStyleChange,
  onWeatherOpacityChange, onLoadArea, onClose, t,
}: ControlPanelProps) {
  return (
    <aside className="control-panel" aria-label={t('controls.layers')}>
      <div className="panel-heading">
        <div><span>{t('app.name')}</span><strong>{t('controls.layers')}</strong></div>
        <button type="button" onClick={onClose} aria-label={t('controls.close')}><X /></button>
      </div>

      <PanelGroup label={t('controls.mode')}>
        <Segmented options={[
          ['demo', t('mode.demo')], ['live-beta', t('mode.live')],
        ]} value={mode} onChange={(value) => onModeChange(value as AppMode)} />
        {mode === 'live-beta' && (
          <button type="button" className="load-area-button" onClick={onLoadArea}>
            <RefreshCw /> {t('controls.refresh')}
          </button>
        )}
      </PanelGroup>

      <PanelGroup label={t('controls.map')}>
        <Segmented options={[
          ['dark', t('controls.dark')], ['opengrid', t('controls.light')],
          ['satellite', t('controls.satellite')], ['night', t('controls.night')],
        ]} value={mapStyle} onChange={(value) => onMapStyleChange(value as MapStyle)} />
      </PanelGroup>

      <PanelGroup label={t('controls.color')}>
        <Segmented options={[
          ['altitude', t('controls.altitude')], ['speed', t('controls.speed')], ['category', t('controls.category')],
        ]} value={colorMode} onChange={(value) => onColorModeChange(value as ColorMode)} />
      </PanelGroup>

      <PanelGroup label={t('controls.opacity')}>
        <input
          className="opacity-slider"
          type="range"
          min="0.2"
          max="0.8"
          step="0.05"
          value={weatherOpacity}
          onChange={(event) => onWeatherOpacityChange(Number(event.target.value))}
          aria-label={t('controls.opacity')}
        />
      </PanelGroup>

      <PanelGroup label={t('controls.language')}>
        <Segmented options={[["en", "English"], ["ja", "日本語"]]} value={locale} onChange={(value) => onLocaleChange(value as Locale)} />
      </PanelGroup>

      <div className="space-preview">
        <Rocket aria-hidden="true" />
        <div><strong>{t('controls.space')}</strong><p>{t('controls.spaceBody')}</p></div>
      </div>
    </aside>
  );
}

function PanelGroup({ label, children }: { label: string; children: ReactNode }) {
  return <section className="panel-group"><h2>{label}</h2>{children}</section>;
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
