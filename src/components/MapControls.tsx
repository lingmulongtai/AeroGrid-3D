import { Plus, Minus, Home, Sun, Moon } from 'lucide-react';

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  nightMode: boolean;
  onToggleNight: () => void;
}

export function MapControls({
  onZoomIn,
  onZoomOut,
  onResetView,
  nightMode,
  onToggleNight,
}: MapControlsProps) {
  return (
    <div className="absolute bottom-8 right-5 z-20 flex flex-col gap-2">
      <ControlButton
        onClick={onToggleNight}
        active={nightMode}
        title={nightMode ? 'Day mode' : 'Night mode'}
      >
        {nightMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </ControlButton>

      <div className="h-px bg-white/10 mx-1" />

      <ControlButton onClick={onZoomIn} active={false} title="Zoom in">
        <Plus className="w-4 h-4" />
      </ControlButton>

      <ControlButton onClick={onZoomOut} active={false} title="Zoom out">
        <Minus className="w-4 h-4" />
      </ControlButton>

      <ControlButton onClick={onResetView} active={false} title="Reset view">
        <Home className="w-4 h-4" />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  onClick, active, title, children,
}: {
  onClick: () => void;
  active: boolean;
  title: string;
  children: import('react').ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all shadow-lg ${
        active
          ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
          : 'bg-black/60 border-white/10 text-neutral-400 hover:text-white hover:border-white/20 hover:bg-white/10'
      }`}
      style={{ backdropFilter: 'blur(12px)' }}
    >
      {children}
    </button>
  );
}
