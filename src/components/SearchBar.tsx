import { Search, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { FlightRecord } from '../../shared/contracts';
import type { Translator } from '../i18n';

interface SearchBarProps {
  flights: FlightRecord[];
  onSelect: (flight: FlightRecord) => void;
  t: Translator;
}

export function SearchBar({ flights, onSelect, t }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const normalized = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (normalized.length < 2) return [];
    return flights.filter((flight) => [
      flight.callsign, flight.registration, flight.aircraftType, flight.id,
    ].some((value) => value?.toLowerCase().includes(normalized))).slice(0, 7);
  }, [flights, normalized]);

  const select = (flight: FlightRecord) => {
    onSelect(flight);
    setQuery('');
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
              setActiveIndex((index) => index <= 0 ? results.length - 1 : index - 1);
            } else if (event.key === 'Enter' && activeIndex >= 0) {
              event.preventDefault();
              select(results[activeIndex]);
            }
          }}
        />
        {query && <button type="button" onClick={() => setQuery('')} aria-label={t('controls.close')}><X /></button>}
      </div>
      {normalized.length >= 2 && (
        <div className="search-results" id={listId} role="listbox">
          {results.length ? results.map((flight) => (
            <button
              type="button"
              key={flight.id}
              id={`${listId}-${results.indexOf(flight)}`}
              role="option"
              aria-selected={activeIndex === results.indexOf(flight)}
              onMouseEnter={() => setActiveIndex(results.indexOf(flight))}
              onClick={() => select(flight)}
            >
              <span><strong>{flight.callsign}</strong><small>{flight.registration ?? flight.id.toUpperCase()}</small></span>
              <span>{Math.round(flight.altitude * 3.28084).toLocaleString()} ft</span>
            </button>
          )) : <p>{t('search.empty')}</p>}
        </div>
      )}
    </div>
  );
}
