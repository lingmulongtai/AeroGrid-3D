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
    <div className="absolute right-3 top-[9.5rem] z-40 flex flex-col gap-2 sm:right-5 sm:top-auto sm:bottom-64 md:bottom-60">
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
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-10 w-10 items-center justify-center rounded-xl border shadow-lg transition-all sm:h-9 sm:w-9 ${
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
