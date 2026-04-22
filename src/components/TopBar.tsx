import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Activity, Radio, AlertCircle } from 'lucide-react';
import type { FlightStats } from '../hooks/useFlightData';

interface TopBarProps {
  flightStats: FlightStats;
  satelliteCount: number;
}

function utcClock(): string {
  const now = new Date();
  return now.toUTCString().slice(17, 25);
}

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatAltFt(meters: number): string {
  return `${Math.round(meters * 3.28084 / 100) * 100} ft`;
}

function formatKts(ms: number): string {
  return `${Math.round(ms * 1.94384)} kt`;
}

export function TopBar({ flightStats, satelliteCount }: TopBarProps) {
  const [clock, setClock] = useState(utcClock);

  useEffect(() => {
    const id = setInterval(() => setClock(utcClock()), 1000);
    return () => clearInterval(id);
  }, []);

  const isLive = flightStats.isLive;
  const isRateLimited = flightStats.isRateLimited;

  return (
    <motion.div
      initial={{ y: -56, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="absolute top-0 left-0 right-0 h-14 z-20 flex items-center px-4 gap-6 pointer-events-none"
      style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 pointer-events-auto flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.6)]">
          <Activity className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-bold text-sm tracking-tight">
          AeroGrid <span className="text-cyan-400 font-light">3D</span>
        </span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 flex-1">
        {flightStats.total > 0 && (
          <>
            <StatChip
              label="Flights"
              value={formatK(flightStats.airborne)}
              color="yellow"
              icon="✈"
            />
            <StatChip
              label="Satellites"
              value={formatK(satelliteCount)}
              color="cyan"
              icon="🛰"
            />
            {flightStats.avgSpeed > 0 && (
              <StatChip
                label="Avg Speed"
                value={formatKts(flightStats.avgSpeed)}
                color="blue"
                icon="⚡"
              />
            )}
            {flightStats.avgAltitude > 0 && (
              <StatChip
                label="Avg Alt"
                value={formatAltFt(flightStats.avgAltitude)}
                color="purple"
                icon="↑"
              />
            )}
          </>
        )}
      </div>

      {/* Clock + status */}
      <div className="flex items-center gap-3 pointer-events-auto flex-shrink-0">
        {isRateLimited && (
          <div className="flex items-center gap-1.5 text-amber-400 text-xs">
            <AlertCircle className="w-3.5 h-3.5" />
            <span className="font-mono">Rate Limited</span>
          </div>
        )}

        {/* Connection status */}
        <div className="flex items-center gap-1.5">
          {isLive ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
              </span>
              <span className="text-green-400 text-xs font-medium">LIVE</span>
            </>
          ) : (
            <>
              <Radio className="w-3 h-3 text-amber-400" />
              <span className="text-amber-400 text-xs font-medium">SIM</span>
            </>
          )}
        </div>

        {/* UTC Clock */}
        <div className="font-mono text-sm text-neutral-300 tabular-nums">
          <span className="text-neutral-500">UTC </span>
          {clock}
        </div>
      </div>
    </motion.div>
  );
}

function StatChip({ label, value, color, icon }: {
  label: string; value: string; color: string; icon: string;
}) {
  const colorMap: Record<string, string> = {
    yellow: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/5',
    cyan:   'text-cyan-400 border-cyan-500/20 bg-cyan-500/5',
    blue:   'text-blue-400 border-blue-500/20 bg-blue-500/5',
    purple: 'text-purple-400 border-purple-500/20 bg-purple-500/5',
  };

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs ${colorMap[color] ?? colorMap.cyan} select-none`}>
      <span>{icon}</span>
      <span className="font-mono font-semibold">{value}</span>
      <span className="text-neutral-500">{label}</span>
    </div>
  );
}
