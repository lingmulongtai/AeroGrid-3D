import React from 'react';
import { Plane, Satellite, CloudRain, Layers, Settings, Maximize, Activity } from 'lucide-react';
import { motion } from 'motion/react';

interface SidebarProps {
  showFlights: boolean;
  setShowFlights: (s: boolean) => void;
  showSatellites: boolean;
  setShowSatellites: (s: boolean) => void;
  showWeather: boolean;
  setShowWeather: (s: boolean) => void;
}

export function Sidebar({
  showFlights, setShowFlights,
  showSatellites, setShowSatellites,
  showWeather, setShowWeather
}: SidebarProps) {
  return (
    <motion.div 
      initial={{ x: -300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="absolute top-4 left-4 w-72 bg-neutral-900/80 backdrop-blur-md rounded-2xl border border-neutral-800 shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col p-5 z-10"
      style={{
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05), 0 20px 40px rgba(0,0,0,0.5)'
      }}
    >
      <div className="flex items-center gap-3 mb-8">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.5)]">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-xl font-bold font-sans text-white tracking-tight">AeroGrid <span className="font-light text-cyan-400">3D</span></h1>
      </div>

      <div className="space-y-6">
        <Section title="Data Layers" icon={<Layers className="w-4 h-4 text-neutral-400" />}>
          <ToggleItem 
            active={showFlights} 
            onClick={() => setShowFlights(!showFlights)}
            icon={<Plane className="w-4 h-4" />}
            label="Aviation Traffic"
            description="Live global flight tracking"
            color="yellow"
          />
          <ToggleItem 
            active={showSatellites} 
            onClick={() => setShowSatellites(!showSatellites)}
            icon={<Satellite className="w-4 h-4" />}
            label="Satellites (LEO)"
            description="Active orbital satellites"
            color="cyan"
          />
          <ToggleItem 
            active={showWeather} 
            onClick={() => setShowWeather(!showWeather)}
            icon={<CloudRain className="w-4 h-4" />}
            label="Weather Radar"
            description="Real-time precipitation"
            color="blue"
          />
        </Section>
      </div>

      <div className="mt-auto pt-8 flex gap-3">
        <button className="flex-1 bg-neutral-800/50 hover:bg-neutral-800 p-2 rounded-xl border border-neutral-700/50 transition-colors flex items-center justify-center text-neutral-400 hover:text-white">
          <Settings className="w-4 h-4" />
        </button>
        <button className="flex-1 bg-neutral-800/50 hover:bg-neutral-800 p-2 rounded-xl border border-neutral-700/50 transition-colors flex items-center justify-center text-neutral-400 hover:text-white" onClick={() => document.documentElement.requestFullscreen()}>
          <Maximize className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

function Section({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        {icon}
        <h2 className="text-xs uppercase font-bold tracking-wider text-neutral-500">{title}</h2>
      </div>
      <div className="flex flex-col gap-2">
        {children}
      </div>
    </div>
  );
}

function ToggleItem({ active, onClick, icon, label, description, color }: any) {
  const colorMap: any = {
    yellow: 'peer-checked:bg-yellow-500',
    cyan: 'peer-checked:bg-cyan-500',
    blue: 'peer-checked:bg-blue-500',
  };
  const glowMap: any = {
    yellow: 'peer-checked:shadow-[0_0_15px_rgba(234,179,8,0.5)]',
    cyan: 'peer-checked:shadow-[0_0_15px_rgba(6,182,212,0.5)]',
    blue: 'peer-checked:shadow-[0_0_15px_rgba(59,130,246,0.5)]',
  }
  const textMap: any = {
    yellow: active ? 'text-yellow-400' : 'text-neutral-500',
    cyan: active ? 'text-cyan-400' : 'text-neutral-500',
    blue: active ? 'text-blue-400' : 'text-neutral-500',
  }

  return (
    <button 
      onClick={onClick}
      className={`group flex items-center p-3 rounded-xl border transition-all text-left ${active ? 'bg-neutral-800/80 border-neutral-700' : 'bg-neutral-900/40 border-neutral-800/50 hover:bg-neutral-800/50'}`}
    >
      <div className={`w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center transition-colors mr-3 shadow-inner ${textMap[color]}`}>
        {icon}
      </div>
      <div className="flex-1">
        <h3 className={`text-sm font-semibold transition-colors ${active ? 'text-white' : 'text-neutral-300 group-hover:text-white'}`}>{label}</h3>
        <p className="text-xs text-neutral-500 font-mono mt-0.5">{description}</p>
      </div>
      <div className="relative flex items-center justify-center">
        <input type="checkbox" className="peer sr-only" checked={active} readOnly />
        <div className={`w-8 h-4 bg-neutral-800 rounded-full peer-checked:bg-neutral-700 transition-colors border border-neutral-700/50`}></div>
        <div className={`absolute left-0.5 w-3 h-3 bg-neutral-500 rounded-full transition-all peer-checked:translate-x-4 peer-checked:bg-white ${glowMap[color]} ${colorMap[color]}`}></div>
      </div>
    </button>
  );
}
