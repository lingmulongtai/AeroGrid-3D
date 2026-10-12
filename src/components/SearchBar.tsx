import { MapPin, Plane, Satellite, Search, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { FlightRecord } from '../../shared/contracts';
import type { Airport } from '../data/airports';
import type { SatelliteRecord } from '../data/satellites';
import type { MessageKey, Translator } from '../i18n';

export type SearchResult =
  | { kind: 'aircraft'; flight: FlightRecord }
  | { kind: 'satellite'; satellite: SatelliteRecord }
  | { kind: 'airport'; airport: Airport };

interface SearchBarProps {
  flights: FlightRecord[];
  satellites: SatelliteRecord[];
  airports: Airport[];
  onSelect: (result: SearchResult) => void;
  t: Translator;
}

function keyOf(result: SearchResult) {
  if (result.kind === 'aircraft') return `a:${result.flight.id}`;
  if (result.kind === 'satellite') return `s:${result.satellite.id}`;
  return `p:${result.airport.iata}`;
}

export function SearchBar({ flights, satellites, airports, onSelect, t }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const normalized = query.trim().toLowerCase();
  const results = useMemo<SearchResult[]>(() => {
    if (normalized.length < 2) return [];
    const matches = (value?: string) => value?.toLowerCase().includes(normalized) ?? false;
    const aircraft = flights
      .filter((flight) => [flight.callsign, flight.registration, flight.aircraftType, flight.id].some(matches))
      .slice(0, 5)
      .map((flight) => ({ kind: 'aircraft' as const, flight }));
    const sats = satellites.filter((satellite) => matches(satellite.name)).slice(0, 3)
      .map((satellite) => ({ kind: 'satellite' as const, satellite }));
    const ports = airports
      .filter((airport) => airport.iata.toLowerCase() === normalized || matches(airport.city) || matches(airport.name) || matches(airport.icao))
      .sort((a, b) => Number(b.iata.toLowerCase() === normalized) - Number(a.iata.toLowerCase() === normalized) || a.tier - b.tier)
      .slice(0, 3)
      .map((airport) => ({ kind: 'airport' as const, airport }));
    return [...ports.filter((port) => port.airport.iata.toLowerCase() === normalized), ...aircraft, ...sats, ...ports.filter((port) => port.airport.iata.toLowerCase() !== normalized)].slice(0, 9);
  }, [airports, flights, normalized, satellites]);

  const select = (result: SearchResult) => {
    onSelect(result);
    setQuery('');
    setActiveIndex(-1);
  };

  return (
    <div className="atlas-search">
      <div className="search-input-wrap">
        <Search aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(-1); }}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={normalized.length >= 2}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuery('');
            if (!results.length) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % results.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              select(results[Math.max(0, activeIndex)]);
            }
          }}
        />
        {query && <button type="button" onClick={() => setQuery('')} aria-label={t('controls.close')}><X /></button>}
      </div>
      {normalized.length >= 2 && (
        <div className="search-results" id={listId} role="listbox">
          {results.length ? results.map((result, index) => (
            <button
              type="button"
              key={keyOf(result)}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={activeIndex === index}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => select(result)}
            >
              <span className={`result-icon result-${result.kind}`}>
                {result.kind === 'aircraft' ? <Plane /> : result.kind === 'satellite' ? <Satellite /> : <MapPin />}
              </span>
              {result.kind === 'aircraft' && (
                <>
                  <span><strong>{result.flight.callsign}</strong><small>{result.flight.aircraftType ?? ''} · {result.flight.registration ?? result.flight.id.toUpperCase()}</small></span>
                  <span>{Math.round(result.flight.altitude * 3.28084).toLocaleString()} ft</span>
                </>
              )}
              {result.kind === 'satellite' && (
                <>
                  <span><strong>{result.satellite.name}</strong><small>{t(`satellite.category.${result.satellite.category}` as MessageKey)}</small></span>
                  <span>{Math.round(result.satellite.altitudeKm).toLocaleString()} km</span>
                </>
              )}
              {result.kind === 'airport' && (
                <>
                  <span><strong>{result.airport.iata} · {result.airport.city}</strong><small>{result.airport.name}</small></span>
                  <span>{result.airport.country}</span>
                </>
              )}
            </button>
          )) : <p>{t('search.empty')}</p>}
        </div>
      )}
    </div>
  );
}
