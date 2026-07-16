import { CloudRain, MapPin, Plane, Route, Satellite, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LayerKey, LayerVisibility } from '../types/layers';
import type { Translator } from '../i18n';

interface ControlDockProps {
  layers: LayerVisibility;
  panelOpen: boolean;
  onToggleLayer: (key: LayerKey) => void;
  onTogglePanel: () => void;
  t: Translator;
}

export function ControlDock({ layers, panelOpen, onToggleLayer, onTogglePanel, t }: ControlDockProps) {
  return (
    <nav className="control-dock" aria-label={t('controls.layers')}>
      <DockButton active={layers.flights} label={t('controls.flights')} onClick={() => onToggleLayer('flights')} icon={<Plane />} />
      <DockButton active={layers.satellites} label={t('controls.satellites')} onClick={() => onToggleLayer('satellites')} icon={<Satellite />} />
      <DockButton active={layers.weather} label={t('controls.weather')} onClick={() => onToggleLayer('weather')} icon={<CloudRain />} />
      <DockButton active={layers.flightTrails} label={t('controls.trails')} onClick={() => onToggleLayer('flightTrails')} icon={<Route />} />
      <DockButton active={layers.airports} label={t('controls.airports')} onClick={() => onToggleLayer('airports')} icon={<MapPin />} />
      <span className="dock-separator" />
      <DockButton active={panelOpen} label={t('controls.layers')} onClick={onTogglePanel} icon={<SlidersHorizontal />} />
    </nav>
  );
}

function DockButton({ active, label, onClick, icon }: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button type="button" aria-pressed={active} aria-label={label} title={label} onClick={onClick}>
      {icon}<span>{label}</span>
    </button>
  );
}
