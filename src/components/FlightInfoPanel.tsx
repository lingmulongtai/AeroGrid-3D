import { motion } from 'motion/react';
import { X, Navigation, Gauge, ArrowUp, ArrowDown, Minus, Crosshair, Radio, Satellite } from 'lucide-react';
import type { Flight } from '../hooks/useFlightData';
import type { SatelliteInfo } from '../hooks/useSatelliteData';
import { SATELLITE_COLORS } from '../hooks/useSatelliteData';
import { formatAltitude, formatSpeed, formatHeading, countryToFlag, getAltitudeColor } from '../utils/flightUtils';

export type SelectedObject =
  | { type: 'flight'; data: Flight }
  | { type: 'satellite'; data: SatelliteInfo }
  | null;

interface FlightInfoPanelProps {
  selected: SelectedObject;
  onClose: () => void;
  onTrack: (obj: SelectedObject) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  heavy: 'Heavy', large: 'Large', medium: 'Medium',
  small: 'Small', light: 'Light', helicopter: 'Rotorcraft', unknown: 'Unknown',
};

const CATEGORY_COLORS: Record<string, string> = {
  heavy: 'bg-red-500/20 text-red-400 border-red-500/30',
  large: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  small: 'bg-green-500/20 text-green-400 border-green-500/30',
  light: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  helicopter: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  unknown: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30',
};

const GROUP_LABELS: Record<string, string> = {
  stations: 'Space Station', starlink: 'Starlink', weather: 'Weather Sat',
  gps: 'GPS', active: 'Active LEO',
};

function toRgbStr(color: [number, number, number, number]): string {
  return `rgb(${color[0]},${color[1]},${color[2]})`;
}

export function FlightInfoPanel({ selected, onClose, onTrack }: FlightInfoPanelProps) {
  if (!selected) return null;

  return (
    <motion.div
      key={selected.type === 'flight' ? selected.data.id : selected.data.id}
      initial={{ x: 340, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 340, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="absolute top-16 right-4 w-76 z-20 rounded-2xl border border-white/8 shadow-[0_8px_40px_rgba(0,0,0,0.6)] overflow-hidden"
      style={{
        background: 'rgba(8,8,12,0.92)',
        backdropFilter: 'blur(20px)',
        width: '300px',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 pb-3">
        <div className="flex-1 min-w-0">
          {selected.type === 'flight' ? (
            <FlightHeader flight={selected.data} />
          ) : (
            <SatelliteHeader sat={selected.data} />
          )}
        </div>
        <button
          onClick={onClose}
          className="ml-3 mt-0.5 p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/5 mx-4" />

      {/* Stats */}
      <div className="p-4 pt-3">
        {selected.type === 'flight' ? (
          <FlightStats flight={selected.data} />
        ) : (
          <SatelliteStats sat={selected.data} />
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex gap-2">
        <button
          onClick={() => onTrack(selected)}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium hover:bg-cyan-500/20 transition-colors"
        >
          <Crosshair className="w-3.5 h-3.5" />
          Track
        </button>
        <button
          onClick={onClose}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 border border-white/8 text-neutral-400 text-xs font-medium hover:bg-white/10 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </motion.div>
  );
}

function FlightHeader({ flight }: { flight: Flight }) {
  const [r, g, b] = getAltitudeColor(flight.altitude);
  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <Radio className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
        <span className="font-mono font-bold text-white text-lg tracking-widest truncate">
          {flight.callsign}
        </span>
        <span className="text-base">{countryToFlag(flight.country)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="px-2 py-0.5 rounded-md text-xs font-medium border"
          style={{ color: `rgb(${r},${g},${b})`, borderColor: `rgba(${r},${g},${b},0.3)`, background: `rgba(${r},${g},${b},0.1)` }}
        >
          {CATEGORY_LABELS[flight.category] ?? 'Unknown'}
        </span>
        <span className="text-neutral-500 text-xs font-mono">{flight.id.toUpperCase()}</span>
      </div>
    </>
  );
}

function SatelliteHeader({ sat }: { sat: SatelliteInfo }) {
  const color = SATELLITE_COLORS[sat.group];
  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <Satellite className="w-3.5 h-3.5 flex-shrink-0" style={{ color: toRgbStr(color) }} />
        <span className="font-mono font-bold text-white text-sm tracking-wide truncate leading-tight">
          {sat.name}
        </span>
      </div>
      <span
        className="inline-block px-2 py-0.5 rounded-md text-xs font-medium border"
        style={{
          color: toRgbStr(color),
          borderColor: `rgba(${color[0]},${color[1]},${color[2]},0.3)`,
          background: `rgba(${color[0]},${color[1]},${color[2]},0.1)`,
        }}
      >
        {GROUP_LABELS[sat.group] ?? sat.group}
      </span>
    </>
  );
}

function FlightStats({ flight }: { flight: Flight }) {
  const vr = flight.verticalRate ?? 0;
  const VrIcon = vr > 1 ? ArrowUp : vr < -1 ? ArrowDown : Minus;
  const vrColor = vr > 1 ? 'text-green-400' : vr < -1 ? 'text-red-400' : 'text-neutral-500';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Altitude" value={formatAltitude(flight.altitude)} sub={`${Math.round(flight.altitude).toLocaleString()} m`} color="cyan" />
        <StatBox label="Speed" value={`${Math.round(flight.velocity * 1.94384)} kt`} sub={`${Math.round(flight.velocity * 3.6)} km/h`} color="yellow" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatBox
          label="Heading"
          value={formatHeading(flight.heading)}
          sub=""
          color="blue"
          icon={
            <Navigation
              className="w-3 h-3 text-blue-400 inline-block mr-1"
              style={{ transform: `rotate(${flight.heading}deg)` }}
            />
          }
        />
        <StatBox
          label="Vert Rate"
          value={`${vr > 0 ? '+' : ''}${Math.round(vr * 196.85)} ft/m`}
          sub=""
          color="neutral"
          icon={<VrIcon className={`w-3 h-3 inline-block mr-1 ${vrColor}`} />}
        />
      </div>
      <div className="flex items-center gap-2 px-1">
        <Gauge className="w-3.5 h-3.5 text-neutral-500" />
        <span className="text-neutral-500 text-xs">{flight.country}</span>
        {flight.onGround && (
          <span className="ml-auto text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
            On Ground
          </span>
        )}
      </div>
    </div>
  );
}

function SatelliteStats({ sat }: { sat: SatelliteInfo }) {
  const altKm = (sat.altitude / 1000).toFixed(0);
  const period = sat.orbitalPeriodMin > 0
    ? sat.orbitalPeriodMin >= 60
      ? `${(sat.orbitalPeriodMin / 60).toFixed(1)} h`
      : `${Math.round(sat.orbitalPeriodMin)} min`
    : '—';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Altitude" value={`${altKm} km`} sub={`${Math.round(sat.altitude / 1000).toLocaleString()} km`} color="cyan" />
        <StatBox label="Period" value={period} sub="" color="purple" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Latitude" value={`${sat.latitude.toFixed(2)}°`} sub="" color="blue" />
        <StatBox label="Longitude" value={`${sat.longitude.toFixed(2)}°`} sub="" color="blue" />
      </div>
      <p className="text-xs text-neutral-600 px-1">Data: CelesTrak / NORAD</p>
    </div>
  );
}

function StatBox({ label, value, sub, color, icon }: {
  label: string; value: string; sub: string; color: string; icon?: import('react').ReactNode;
}) {
  const colorMap: Record<string, string> = {
    cyan: 'text-cyan-300', yellow: 'text-yellow-300', blue: 'text-blue-300',
    purple: 'text-purple-300', neutral: 'text-white',
  };
  return (
    <div className="bg-white/3 rounded-xl p-2.5 border border-white/5">
      <p className="text-neutral-500 text-[10px] uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-mono text-sm font-semibold ${colorMap[color] ?? 'text-white'}`}>
        {icon}{value}
      </p>
      {sub && <p className="text-neutral-600 text-[10px] mt-0.5 font-mono">{sub}</p>}
    </div>
  );
}
