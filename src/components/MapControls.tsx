import { Home, Minus, Moon, Plus, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Translator } from '../i18n';

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  nightMode: boolean;
  onToggleNight: () => void;
  t: Translator;
}

export function MapControls({ onZoomIn, onZoomOut, onResetView, nightMode, onToggleNight, t }: MapControlsProps) {
  return (
    <nav className="map-controls" aria-label={t('controls.mapControls')}>
      <ControlButton onClick={onToggleNight} active={nightMode} label={nightMode ? t('controls.dayLighting') : t('controls.nightLighting')}>
        {nightMode ? <Sun /> : <Moon />}
      </ControlButton>
      <span />
      <ControlButton onClick={onZoomIn} active={false} label={t('controls.zoomIn')}><Plus /></ControlButton>
      <ControlButton onClick={onZoomOut} active={false} label={t('controls.zoomOut')}><Minus /></ControlButton>
      <ControlButton onClick={onResetView} active={false} label={t('controls.resetView')}><Home /></ControlButton>
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
