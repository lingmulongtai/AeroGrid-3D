import { useState } from 'react';
import {
  Plane, Satellite, CloudRain, Layers, Settings, Maximize2, Minimize2, Activity,
  ChevronUp, ChevronDown, Tag, Map, BarChart3, Cable, Factory,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { FlightStats } from '../hooks/useFlightData';
import type { SatelliteGroup, SatelliteGroupCounts } from '../hooks/useSatelliteData';
import { SATELLITE_COLORS } from '../hooks/useSatelliteData';
import type { ColorMode } from './Map';
import type { MapStyle } from './layers/basemapLayer';
import type { LayerKey, LayerVisibility } from '../types/layers';
import type { QualityPreset } from '../types/quality';

interface SidebarProps {
  layers: LayerVisibility;
  onToggleLayer: (key: LayerKey) => void;
  activeGroups: Set<SatelliteGroup>;
  setActiveGroups: (g: Set<SatelliteGroup>) => void;
  colorMode: ColorMode;
  setColorMode: (m: ColorMode) => void;
  mapStyle: MapStyle;
  setMapStyle: (s: MapStyle) => void;
  qualityPreset: QualityPreset;
  onOpenSettings: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  flightStats: FlightStats;
  satelliteCounts: SatelliteGroupCounts;
}

const SAT_GROUPS: { id: SatelliteGroup; label: string }[] = [
  { id: 'stations', label: 'ISS / Stations' },
  { id: 'starlink', label: 'Starlink' },
  { id: 'gps', label: 'GPS' },
  { id: 'weather', label: 'Weather Sats' },
  { id: 'active', label: 'Visually Active' },
];

function toRgbStr(c: [number, number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function Sidebar({
  layers,
  onToggleLayer,
  activeGroups,
  setActiveGroups,
  colorMode,
  setColorMode,
  mapStyle,
  setMapStyle,
  qualityPreset,
  onOpenSettings,
  isFullscreen,
  onToggleFullscreen,
  flightStats,
  satelliteCounts,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [satsExpanded, setSatsExpanded] = useState(false);

  function toggleGroup(g: SatelliteGroup) {
    const next = new Set(activeGroups);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    setActiveGroups(next);
  }

  return (
    <motion.div
      initial={{ x: -320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 right-3 z-20 flex flex-col overflow-hidden rounded-3xl border border-white/8 sm:left-4 sm:right-auto sm:top-4 sm:bottom-auto sm:w-72 sm:rounded-2xl ${
        collapsed ? 'max-h-[60px]' : 'max-h-[min(58dvh,calc(100dvh-8.75rem))] sm:max-h-[calc(100vh-2rem)]'
      }`}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        background: 'rgba(6,6,10,0.92)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/5 p-3 sm:p-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_16px_rgba(6,182,212,0.5)]">
          <Activity className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold leading-none tracking-tight text-white">
            AeroGrid <span className="font-light text-cyan-400">3D</span>
          </h1>
          <p className="mt-0.5 truncate font-mono text-[10px] text-neutral-600">Demo Command Panel</p>
        </div>

        <button
          type="button"
          className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Expand panel' : 'Collapse up'}
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex-1 overflow-y-auto overscroll-contain sidebar-scroll"
          >
            {flightStats.total > 0 && (
              <div className="border-b border-white/5 p-3 pb-3 sm:p-4 sm:pb-3">
                <div className="flex items-center gap-1.5 mb-3">
                  <BarChart3 className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Live Stats</span>
                </div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-2">
                  <MiniStat label="Airborne" value={flightStats.airborne.toLocaleString()} color="yellow" />
                  <MiniStat label="Satellites" value={satelliteCounts.total.toLocaleString()} color="cyan" />
                  <MiniStat label="Quality" value={qualityPreset.toUpperCase()} color="blue" />
                  <MiniStat label="Layers" value={Object.values(layers).filter(Boolean).length.toString()} color="purple" />
                </div>
              </div>
            )}

            <div className="px-3 pt-3 pb-1 sm:px-4">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-neutral-500" />
                <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Data Layers</span>
              </div>
            </div>

            <div className="space-y-1 px-3 pb-2">
              <LayerToggle icon={<Plane className="w-4 h-4" />} active={layers.flights} label="Aviation Traffic" onToggle={() => onToggleLayer('flights')} />
              <LayerToggle icon={<CloudRain className="w-4 h-4" />} active={layers.weather} label="Weather" onToggle={() => onToggleLayer('weather')} />
              <LayerToggle icon={<Satellite className="w-4 h-4" />} active={layers.satellites} label="Satellites" onToggle={() => onToggleLayer('satellites')} />
              <LayerToggle icon={<Cable className="w-4 h-4" />} active={layers.subseaCables} label="Data Centers" onToggle={() => onToggleLayer('subseaCables')} />
              <LayerToggle icon={<Factory className="w-4 h-4" />} active={layers.powerPlants} label="Power Grid" onToggle={() => onToggleLayer('powerPlants')} />

              <div className="grid grid-cols-2 gap-1 pt-1 sm:block sm:space-y-1 sm:pl-3">
                <SubOption label="Flight Trails" checked={layers.flightTrails} onChange={() => onToggleLayer('flightTrails')} />
                <SubOption label="Satellite Trails" checked={layers.satelliteTrails} onChange={() => onToggleLayer('satelliteTrails')} />
                <SubOption label="Labels" checked={layers.labels} onChange={() => onToggleLayer('labels')} />
                <SubOption label="Airports" checked={layers.airports} onChange={() => onToggleLayer('airports')} />
              </div>
            </div>

            <div className="border-t border-white/5 px-3 pb-3 pt-3 sm:px-4">
              <button
                type="button"
                className="w-full text-left text-[10px] uppercase tracking-wider text-neutral-500 mb-2 flex items-center justify-between"
                onClick={() => setSatsExpanded((v) => !v)}
              >
                <span>Satellite Groups</span>
                {satsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {satsExpanded && (
                <div className="space-y-1">
                  {SAT_GROUPS.map((g) => {
                    const color = SATELLITE_COLORS[g.id];
                    const count = satelliteCounts[g.id] ?? 0;
                    const isActive = activeGroups.has(g.id);
                    return (
                      <button
                        type="button"
                        key={g.id}
                        onClick={() => g.id !== 'stations' && toggleGroup(g.id)}
                        disabled={g.id === 'stations'}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                          isActive ? 'text-white bg-white/5' : 'text-neutral-500'
                        } ${g.id !== 'stations' ? 'hover:bg-white/8 cursor-pointer' : 'cursor-default opacity-80'}`}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ background: toRgbStr(color), boxShadow: `0 0 6px ${toRgbStr(color)}` }} />
                        <span className="flex-1 text-left">{g.label}</span>
                        <span className="text-neutral-600 font-mono text-[10px]">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-white/5 px-3 py-3 sm:px-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Tag className="w-3.5 h-3.5 text-neutral-500" />
                <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Color Mode</span>
              </div>
              <div className="flex gap-1">
                {(['altitude', 'speed', 'category'] as ColorMode[]).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    onClick={() => setColorMode(mode)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${
                      colorMode === mode ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' : 'bg-white/3 border-white/8 text-neutral-500'
                    }`}
                  >
                    {mode === 'altitude' ? 'Alt' : mode === 'speed' ? 'Speed' : 'Type'}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-white/5 px-3 pb-3 pt-3 sm:px-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Map className="w-3.5 h-3.5 text-neutral-500" />
                <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Map Style</span>
              </div>
              <div className="flex gap-1">
                {([
                  ['opengrid', 'OpenGrid'],
                  ['dark', 'Dark'],
                  ['satellite', 'Satellite'],
                  ['night', 'Night'],
                ] as [MapStyle, string][]).map(([style, label]) => (
                  <button
                    type="button"
                    key={style}
                    onClick={() => setMapStyle(style)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${
                      mapStyle === style ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' : 'bg-white/3 border-white/8 text-neutral-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-white/5 p-3">
              <button
                type="button"
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-white/8 bg-white/3 text-neutral-300 hover:bg-white/8 text-xs"
                onClick={onOpenSettings}
              >
                <Settings className="w-3.5 h-3.5" />
                Settings
              </button>
              <button
                type="button"
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-white/8 bg-white/3 text-neutral-300 hover:bg-white/8 text-xs"
                onClick={onToggleFullscreen}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                {isFullscreen ? 'Exit Full' : 'Fullscreen'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    yellow: 'text-yellow-400', cyan: 'text-cyan-400', blue: 'text-blue-400', purple: 'text-purple-400',
  };
  return (
    <div className="rounded-xl border border-white/5 bg-white/3 p-2">
      <p className="text-neutral-600 text-[9px] uppercase tracking-wider">{label}</p>
      <p className={`font-mono text-xs font-bold mt-0.5 ${colorMap[color] ?? 'text-white'}`}>{value}</p>
    </div>
  );
}

function LayerToggle({ active, onToggle, icon, label }: {
  active: boolean;
  onToggle: () => void;
  icon: import('react').ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`w-full flex items-center gap-2 rounded-xl border px-2 py-2.5 sm:py-2 ${active ? 'bg-white/6 border-white/10 text-white' : 'border-transparent text-neutral-500 hover:bg-white/5'}`}
      onClick={onToggle}
    >
      <span className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center">{icon}</span>
      <span className="flex-1 text-left text-sm">{label}</span>
      <span className={`w-9 h-5 rounded-full ${active ? 'bg-cyan-500' : 'bg-neutral-800'} relative`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${active ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}

function SubOption({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-white/5 sm:py-1.5"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${checked ? 'bg-cyan-400' : 'bg-neutral-700'}`} />
      <span className={`flex-1 text-left ${checked ? 'text-neutral-200' : 'text-neutral-500'}`}>{label}</span>
    </button>
  );
}
