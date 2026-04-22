import { useState } from 'react';
import {
  Plane, Satellite, CloudRain, Layers, Settings, Maximize, Activity,
  ChevronDown, ChevronRight, Tag, Wind, Map, BarChart3,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { FlightStats } from '../hooks/useFlightData';
import type { SatelliteGroup, SatelliteGroupCounts } from '../hooks/useSatelliteData';
import { SATELLITE_COLORS } from '../hooks/useSatelliteData';
import type { ColorMode, MapStyle } from './Map';

interface SidebarProps {
  showFlights: boolean;
  setShowFlights: (v: boolean) => void;
  showSatellites: boolean;
  setShowSatellites: (v: boolean) => void;
  showWeather: boolean;
  setShowWeather: (v: boolean) => void;
  showAirports: boolean;
  setShowAirports: (v: boolean) => void;

  showTrails: boolean;
  setShowTrails: (v: boolean) => void;
  showLabels: boolean;
  setShowLabels: (v: boolean) => void;
  hideOnGround: boolean;
  setHideOnGround: (v: boolean) => void;

  activeGroups: Set<SatelliteGroup>;
  setActiveGroups: (g: Set<SatelliteGroup>) => void;

  colorMode: ColorMode;
  setColorMode: (m: ColorMode) => void;
  mapStyle: MapStyle;
  setMapStyle: (s: MapStyle) => void;

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
  showFlights, setShowFlights,
  showSatellites, setShowSatellites,
  showWeather, setShowWeather,
  showAirports, setShowAirports,
  showTrails, setShowTrails,
  showLabels, setShowLabels,
  hideOnGround, setHideOnGround,
  activeGroups, setActiveGroups,
  colorMode, setColorMode,
  mapStyle, setMapStyle,
  flightStats, satelliteCounts,
}: SidebarProps) {
  const [flightsExpanded, setFlightsExpanded] = useState(true);
  const [satsExpanded, setSatsExpanded] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);

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
      className="absolute top-4 left-4 w-72 z-20 rounded-2xl border border-white/8 flex flex-col overflow-hidden"
      style={{
        background: 'rgba(6,6,10,0.92)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)',
        maxHeight: 'calc(100vh - 2rem)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-3 border-b border-white/5 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_16px_rgba(6,182,212,0.5)]">
          <Activity className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white tracking-tight leading-none">
            AeroGrid <span className="font-light text-cyan-400">3D</span>
          </h1>
          <p className="text-[10px] text-neutral-600 mt-0.5 font-mono">Real-Time Globe Tracker</p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto sidebar-scroll">

        {/* Live Stats */}
        {flightStats.total > 0 && (
          <div className="p-4 pb-3 border-b border-white/5">
            <div className="flex items-center gap-1.5 mb-3">
              <BarChart3 className="w-3.5 h-3.5 text-neutral-500" />
              <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Live Stats</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Airborne" value={flightStats.airborne.toLocaleString()} color="yellow" />
              <MiniStat label="Satellites" value={satelliteCounts.total.toLocaleString()} color="cyan" />
              <MiniStat
                label="Avg Speed"
                value={flightStats.avgSpeed > 0 ? `${Math.round(flightStats.avgSpeed * 1.94384)} kt` : '—'}
                color="blue"
              />
              <MiniStat
                label="Avg Altitude"
                value={flightStats.avgAltitude > 0 ? `${Math.round(flightStats.avgAltitude / 100) * 100 / 1000}k m` : '—'}
                color="purple"
              />
            </div>
          </div>
        )}

        {/* Data Layers header */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-neutral-500" />
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Data Layers</span>
          </div>
        </div>

        <div className="px-3 pb-2 space-y-1">
          {/* Flights */}
          <LayerRow
            active={showFlights}
            onToggle={() => setShowFlights(!showFlights)}
            icon={<Plane className="w-4 h-4" />}
            label="Aviation Traffic"
            color="yellow"
            count={flightStats.airborne > 0 ? flightStats.airborne : undefined}
            expanded={flightsExpanded}
            onExpand={() => setFlightsExpanded(!flightsExpanded)}
          />
          <AnimatePresence initial={false}>
            {flightsExpanded && showFlights && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="ml-3 mb-1 space-y-0.5">
                  <SubOption
                    label="Show Trails"
                    checked={showTrails}
                    onChange={() => setShowTrails(!showTrails)}
                    color="yellow"
                  />
                  <SubOption
                    label="Show Labels"
                    checked={showLabels}
                    onChange={() => setShowLabels(!showLabels)}
                    color="yellow"
                  />
                  <SubOption
                    label="Hide On-Ground"
                    checked={hideOnGround}
                    onChange={() => setHideOnGround(!hideOnGround)}
                    color="yellow"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Satellites */}
          <LayerRow
            active={showSatellites}
            onToggle={() => setShowSatellites(!showSatellites)}
            icon={<Satellite className="w-4 h-4" />}
            label="Satellites"
            color="cyan"
            count={satelliteCounts.total > 0 ? satelliteCounts.total : undefined}
            expanded={satsExpanded}
            onExpand={() => setSatsExpanded(!satsExpanded)}
          />
          <AnimatePresence initial={false}>
            {satsExpanded && showSatellites && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="ml-3 mb-1 space-y-0.5">
                  {SAT_GROUPS.map(g => {
                    const color = SATELLITE_COLORS[g.id];
                    const count = satelliteCounts[g.id] ?? 0;
                    const isActive = activeGroups.has(g.id);
                    return (
                      <button
                        key={g.id}
                        onClick={() => g.id !== 'stations' && toggleGroup(g.id)}
                        disabled={g.id === 'stations'}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                          isActive ? 'text-white' : 'text-neutral-500'
                        } ${g.id !== 'stations' ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default opacity-80'}`}
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: toRgbStr(color), boxShadow: `0 0 6px ${toRgbStr(color)}` }}
                        />
                        <span className="flex-1 text-left">{g.label}</span>
                        {count > 0 && (
                          <span className="text-neutral-600 font-mono text-[10px]">{count}</span>
                        )}
                        {g.id !== 'stations' && (
                          <div className={`w-5 h-3 rounded-full transition-colors ${isActive ? 'bg-cyan-500' : 'bg-neutral-700'}`}>
                            <div className={`w-2.5 h-2.5 rounded-full bg-white mt-0.5 transition-transform ${isActive ? 'translate-x-2' : 'translate-x-0.5'}`} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Weather */}
          <LayerRow
            active={showWeather}
            onToggle={() => setShowWeather(!showWeather)}
            icon={<CloudRain className="w-4 h-4" />}
            label="Weather Radar"
            color="blue"
            expanded={false}
            onExpand={() => {}}
          />

          {/* Airports */}
          <LayerRow
            active={showAirports}
            onToggle={() => setShowAirports(!showAirports)}
            icon={<Wind className="w-4 h-4" />}
            label="Major Airports"
            color="neutral"
            expanded={false}
            onExpand={() => {}}
          />
        </div>

        {/* Color Mode */}
        <div className="px-4 py-3 border-t border-white/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Tag className="w-3.5 h-3.5 text-neutral-500" />
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Color Mode</span>
          </div>
          <div className="flex gap-1">
            {(['altitude', 'speed', 'category'] as ColorMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setColorMode(mode)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  colorMode === mode
                    ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                    : 'bg-white/3 border-white/8 text-neutral-500 hover:text-neutral-300 hover:bg-white/8'
                }`}
              >
                {mode === 'altitude' ? 'Alt' : mode === 'speed' ? 'Speed' : 'Type'}
              </button>
            ))}
          </div>
        </div>

        {/* Map Style */}
        <div className="px-4 pb-3 border-t border-white/5 pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Map className="w-3.5 h-3.5 text-neutral-500" />
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Map Style</span>
          </div>
          <div className="flex gap-1">
            {([['dark', 'Dark'], ['light', 'Light'], ['satellite', 'Satellite']] as [MapStyle, string][]).map(([s, l]) => (
              <button
                key={s}
                onClick={() => setMapStyle(s)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  mapStyle === s
                    ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                    : 'bg-white/3 border-white/8 text-neutral-500 hover:text-neutral-300 hover:bg-white/8'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="flex gap-2 p-3 border-t border-white/5 flex-shrink-0">
        <button
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-white/8 bg-white/3 text-neutral-500 hover:text-white hover:bg-white/8 transition-all text-xs"
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Settings</span>
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-white/8 bg-white/3 text-neutral-500 hover:text-white hover:bg-white/8 transition-all text-xs"
          onClick={() => document.documentElement.requestFullscreen?.()}
          title="Fullscreen"
        >
          <Maximize className="w-3.5 h-3.5" />
          <span>Fullscreen</span>
        </button>
      </div>
    </motion.div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    yellow: 'text-yellow-400', cyan: 'text-cyan-400', blue: 'text-blue-400', purple: 'text-purple-400',
  };
  return (
    <div className="bg-white/3 rounded-xl p-2 border border-white/5">
      <p className="text-neutral-600 text-[9px] uppercase tracking-wider">{label}</p>
      <p className={`font-mono text-xs font-bold mt-0.5 ${colorMap[color] ?? 'text-white'}`}>{value}</p>
    </div>
  );
}

function LayerRow({
  active, onToggle, icon, label, color, count, expanded, onExpand,
}: {
  active: boolean; onToggle: () => void; icon: import('react').ReactNode;
  label: string; color: string; count?: number; expanded: boolean; onExpand: () => void;
}) {
  const colorMap: Record<string, string> = {
    yellow: active ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' : 'text-neutral-600 bg-transparent border-transparent',
    cyan:   active ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' : 'text-neutral-600 bg-transparent border-transparent',
    blue:   active ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' : 'text-neutral-600 bg-transparent border-transparent',
    neutral: active ? 'text-white bg-white/10 border-white/15' : 'text-neutral-600 bg-transparent border-transparent',
  };

  const toggleColors: Record<string, string> = {
    yellow: 'bg-yellow-500', cyan: 'bg-cyan-500', blue: 'bg-blue-500', neutral: 'bg-white',
  };

  return (
    <div
      className={`flex items-center gap-2 px-2 py-2.5 rounded-xl border transition-all ${
        active ? 'bg-white/4 border-white/8' : 'bg-transparent border-transparent hover:bg-white/3'
      }`}
    >
      {/* Expand chevron */}
      <button
        onClick={onExpand}
        className="text-neutral-600 hover:text-neutral-400 transition-colors flex-shrink-0"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {/* Icon */}
      <div className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 transition-all ${colorMap[color] ?? colorMap.neutral}`}>
        {icon}
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0" onClick={onToggle} style={{ cursor: 'pointer' }}>
        <p className={`text-sm font-medium truncate transition-colors ${active ? 'text-white' : 'text-neutral-400'}`}>
          {label}
        </p>
        {count !== undefined && count > 0 && (
          <p className="text-[10px] text-neutral-600 font-mono">{count.toLocaleString()} active</p>
        )}
      </div>

      {/* Toggle switch */}
      <button
        onClick={onToggle}
        className="relative flex-shrink-0"
      >
        <div className={`w-9 h-5 rounded-full transition-colors ${active ? (toggleColors[color] ?? 'bg-white') : 'bg-neutral-800'}`}>
          <div
            className={`absolute top-1 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
              active ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </div>
      </button>
    </div>
  );
}

function SubOption({ label, checked, onChange, color }: {
  label: string; checked: boolean; onChange: () => void; color: string;
}) {
  const dotColor: Record<string, string> = {
    yellow: 'bg-yellow-500', cyan: 'bg-cyan-500', blue: 'bg-blue-500',
  };
  return (
    <button
      onClick={onChange}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-white/5 transition-colors"
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${checked ? (dotColor[color] ?? 'bg-white') : 'bg-neutral-700'}`} />
      <span className={`flex-1 text-left ${checked ? 'text-neutral-200' : 'text-neutral-500'}`}>{label}</span>
      <div className={`w-7 h-3.5 rounded-full transition-colors ${checked ? 'bg-neutral-600' : 'bg-neutral-800'}`}>
        <div className={`w-2.5 h-2.5 mt-0.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
      </div>
    </button>
  );
}
