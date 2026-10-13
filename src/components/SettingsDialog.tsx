import { Gauge, Monitor, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { MessageKey, Translator } from '../i18n';
import { QUALITY_PRESETS, type QualityPreset, type QualitySettings } from '../types/quality';
import type { EngineStats } from './Map';
import { DataSettings } from './DataSettings';

interface SettingsDialogProps {
  quality: QualitySettings;
  onChange: (quality: QualitySettings) => void;
  onClose: () => void;
  readStats: () => EngineStats | null;
  t: Translator;
  onDataChange: () => void;
}

const PRESETS: QualityPreset[] = ['low', 'medium', 'high', 'ultra'];

export function SettingsDialog({ quality, onChange, onClose, readStats, t, onDataChange }: SettingsDialogProps) {
  const [stats, setStats] = useState<EngineStats | null>(() => readStats());

  useEffect(() => {
    const interval = window.setInterval(() => setStats(readStats()), 1000);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, readStats]);

  const update = (patch: Partial<QualitySettings>) => onChange({ ...quality, ...patch, preset: 'custom' });

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="panel-heading">
          <div><span>{t('app.name')}</span><strong id="settings-title">{t('settings.title')}</strong></div>
          <button type="button" onClick={onClose} aria-label={t('controls.close')}><X /></button>
        </div>

        <section className="panel-group">
          <h2><Monitor />{t('settings.preset')}</h2>
          <div className="preset-grid">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={quality.preset === preset}
                onClick={() => onChange(QUALITY_PRESETS[preset])}
              >
                <strong>{t(`settings.preset.${preset}` as MessageKey)}</strong>
                <small>{t(`settings.preset.${preset}.body` as MessageKey)}</small>
              </button>
            ))}
          </div>
          {quality.preset === 'custom' && <p className="settings-hint">{t('settings.custom')}</p>}
        </section>

        <section className="panel-group">
          <h2>{t('settings.rendering')}</h2>
          <Row label={t('settings.antialias')}>
            <select value={quality.msaa} onChange={(event) => update({ msaa: Number(event.target.value) as QualitySettings['msaa'] })}>
              <option value={0}>{t('settings.off')}</option>
              <option value={2}>MSAA 2×</option>
              <option value={4}>MSAA 4×</option>
              <option value={8}>MSAA 8×</option>
            </select>
          </Row>
          <Row label={t('settings.resolution')}>
            <select value={quality.maxPixelRatio} onChange={(event) => update({ maxPixelRatio: Number(event.target.value) })}>
              <option value={0.75}>75%</option>
              <option value={1}>100%</option>
              <option value={1.5}>150%</option>
              <option value={2}>200%</option>
              <option value={3}>300%</option>
            </select>
          </Row>
          <Row label={t('settings.imagery')}>
            <select value={quality.tileDetail} onChange={(event) => update({ tileDetail: Number(event.target.value) })}>
              <option value={1.6}>{t('settings.imagery.fast')}</option>
              <option value={1.15}>{t('settings.imagery.balanced')}</option>
              <option value={0.95}>{t('settings.imagery.sharp')}</option>
              <option value={0.75}>{t('settings.imagery.max')}</option>
            </select>
          </Row>
          <Toggle label={t('settings.bloom')} checked={quality.bloom} onChange={(bloom) => update({ bloom })} />
        </section>

        <section className="panel-group">
          <h2>{t('settings.objects')}</h2>
          <Slider label={t('settings.maxAircraft')} value={quality.maxFlights} min={200} max={6000} step={100} onChange={(maxFlights) => update({ maxFlights })} />
          <Slider label={t('settings.maxSatellites')} value={quality.maxSatellites} min={50} max={6000} step={50} onChange={(maxSatellites) => update({ maxSatellites })} />
          <Slider label={t('settings.weatherParticles')} value={quality.weatherParticles} min={1000} max={40000} step={1000} onChange={(weatherParticles) => update({ weatherParticles })} />
        </section>

        <DataSettings onChange={onDataChange} t={t} />
        <section className="settings-stats" aria-live="polite">
          <Gauge aria-hidden="true" />
          {stats ? (
            <span>
              {t('settings.stats', {
                fps: stats.fps,
                tiles: stats.tiles,
                objects: (stats.aircraft + stats.satellites + stats.airports).toLocaleString(),
                particles: stats.weatherParticles.toLocaleString(),
              })}
            </span>
          ) : <span>—</span>}
        </section>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <label className="settings-row"><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" className="settings-row settings-toggle" aria-pressed={checked} onClick={() => onChange(!checked)}>
      <span>{label}</span>
      <span className="layer-switch" aria-hidden="true"><span /></span>
    </button>
  );
}

function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void;
}) {
  return (
    <label className="settings-slider">
      <span><span>{label}</span><output>{value.toLocaleString()}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
