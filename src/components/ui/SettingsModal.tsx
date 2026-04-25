import { X } from 'lucide-react';
import type { QualityPreset, QualitySettings } from '../../types/quality';

interface SettingsModalProps {
  open: boolean;
  quality: QualitySettings;
  onApplyPreset: (preset: QualityPreset) => void;
  onClose: () => void;
}

export function SettingsModal({ open, quality, onApplyPreset, onClose }: SettingsModalProps) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b101b] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="font-semibold">Display Settings</h2>
          <button className="p-1.5 rounded-lg hover:bg-white/10" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs text-neutral-400 mb-2">Quality Preset</p>
            <select
              value={quality.preset}
              onChange={(e) => onApplyPreset(e.target.value as QualityPreset)}
              className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 outline-none"
            >
              <option value="high">高 (High)</option>
              <option value="medium">中 (Medium)</option>
              <option value="low">低 (Low)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <Info label="DPR" value={quality.dpr.toFixed(1)} />
            <Info label="Max Flights" value={quality.maxFlights.toLocaleString()} />
            <Info label="Max Satellites" value={quality.maxSatellites.toLocaleString()} />
            <Info label="Weather Particles" value={quality.weatherParticles.toLocaleString()} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-2">
      <p className="text-neutral-500">{label}</p>
      <p className="font-mono text-neutral-200 mt-0.5">{value}</p>
    </div>
  );
}
