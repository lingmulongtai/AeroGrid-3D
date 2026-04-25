import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import type { Flight } from '../hooks/useFlightData';
import type { SatelliteInfo } from '../hooks/useSatelliteData';
import type { SelectedObject } from './FlightInfoPanel';
import { formatAltitude, countryToFlag } from '../utils/flightUtils';

interface SearchBarProps {
  flights: Flight[];
  satellites: SatelliteInfo[];
  onSelect: (obj: SelectedObject) => void;
}

export function SearchBar({ flights, satellites, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const q = query.trim().toUpperCase();

  const flightResults = q.length >= 2
    ? flights
        .filter(f => f.callsign.toUpperCase().includes(q) || f.id.toUpperCase().includes(q))
        .slice(0, 6)
    : [];

  const satResults = q.length >= 2
    ? satellites
        .filter(s => s.name.toUpperCase().includes(q))
        .slice(0, 2)
    : [];

  const results = [...flightResults.map(f => ({ type: 'flight' as const, data: f })),
                   ...satResults.map(s => ({ type: 'satellite' as const, data: s }))];

  const hasResults = results.length > 0;

  function handleChange(val: string) {
    setQuery(val);
    setHighlighted(0);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setOpen(val.trim().length >= 2), 200);
  }

  function handleSelect(obj: SelectedObject) {
    setQuery('');
    setOpen(false);
    onSelect(obj);
  }

  function handleKeyDown(e: import('react').KeyboardEvent) {
    if (!open || !hasResults) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); handleSelect(results[highlighted]); }
    if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  }

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
        && inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-30 w-[26rem] pt-1">
      {/* Input */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 shadow-lg"
        style={{ background: 'rgba(10,10,16,0.85)', backdropFilter: 'blur(16px)' }}
      >
        <Search className="w-4 h-4 text-neutral-500 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search callsign, ICAO, satellite..."
          className="flex-1 bg-transparent text-white text-sm placeholder-neutral-600 outline-none"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setOpen(false); }}
            className="text-neutral-500 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && hasResults && (
        <div
          ref={dropdownRef}
          className="mt-1.5 rounded-xl border border-white/10 overflow-hidden shadow-xl"
          style={{ background: 'rgba(10,10,16,0.95)', backdropFilter: 'blur(20px)' }}
        >
          {results.map((result, i) => (
            <button
              key={result.type === 'flight' ? result.data.id : result.data.id + '-sat'}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                i === highlighted ? 'bg-white/8' : 'hover:bg-white/5'
              } ${i > 0 ? 'border-t border-white/5' : ''}`}
            >
              {result.type === 'flight' ? (
                <>
                  <span className="text-yellow-400 font-mono font-bold text-sm w-20 truncate">
                    {result.data.callsign}
                  </span>
                  <span className="text-base">{countryToFlag(result.data.country)}</span>
                  <span className="text-neutral-500 text-xs flex-1 truncate">{result.data.country}</span>
                  <span className="text-cyan-400 text-xs font-mono flex-shrink-0">
                    {formatAltitude(result.data.altitude)}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-cyan-400 text-xs">🛰</span>
                  <span className="text-white text-sm flex-1 truncate font-mono">{result.data.name}</span>
                  <span className="text-neutral-500 text-xs flex-shrink-0">
                    {Math.round(result.data.altitude / 1000)} km
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
