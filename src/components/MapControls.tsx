import { Home, Maximize, Minimize, Minus, Moon, Plus, Settings, Sun } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { Translator } from '../i18n';

interface MapControlsProps {
  heading: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onResetNorth: () => void;
  lighting: boolean;
  onToggleLighting: () => void;
  onOpenSettings: () => void;
  t: Translator;
}

function useFullscreen() {
  const [active, setActive] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const update = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  return [active, toggle] as const;
}

export function MapControls({
  heading, onZoomIn, onZoomOut, onResetView, onResetNorth, lighting, onToggleLighting, onOpenSettings, t,
}: MapControlsProps) {
  const [fullscreen, toggleFullscreen] = useFullscreen();
  return (
    <nav className="map-controls" aria-label={t('controls.mapControls')}>
      <button type="button" className="compass-button" onClick={onResetNorth} aria-label={t('controls.resetNorth')} title={t('controls.resetNorth')}>
        <svg viewBox="0 0 40 40" style={{ transform: `rotate(${-heading}deg)` }} aria-hidden="true">
          <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeOpacity="0.25" />
          <path d="M20 5 L25 20 L20 17.5 L15 20 Z" fill="#ff5d6c" />
          <path d="M20 35 L15 20 L20 22.5 L25 20 Z" fill="currentColor" fillOpacity="0.55" />
          <text x="20" y="13.5" textAnchor="middle" fontSize="6" fontWeight="800" fill="#fff">N</text>
        </svg>
      </button>
      <span />
      <ControlButton onClick={onToggleLighting} active={lighting} label={lighting ? t('controls.flatLighting') : t('controls.realLighting')}>
        {lighting ? <Sun /> : <Moon />}
      </ControlButton>
      <ControlButton onClick={onZoomIn} active={false} label={t('controls.zoomIn')}><Plus /></ControlButton>
      <ControlButton onClick={onZoomOut} active={false} label={t('controls.zoomOut')}><Minus /></ControlButton>
      <ControlButton onClick={onResetView} active={false} label={t('controls.resetView')}><Home /></ControlButton>
      <span />
      <ControlButton onClick={toggleFullscreen} active={fullscreen} label={fullscreen ? t('controls.exitFullscreen') : t('controls.fullscreen')}>
        {fullscreen ? <Minimize /> : <Maximize />}
      </ControlButton>
      <ControlButton onClick={onOpenSettings} active={false} label={t('controls.settings')}><Settings /></ControlButton>
    </nav>
  );
}

function ControlButton({ onClick, active, label, children }: {
  onClick: () => void;
  active: boolean;
  label: string;
  children: ReactNode;
}) {
  return <button type="button" onClick={onClick} aria-pressed={active} aria-label={label} title={label}>{children}</button>;
}
