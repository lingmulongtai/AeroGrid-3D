import { MAJOR_AIRPORTS, type Airport } from '../airports';

const EXTRA_AIRPORTS: Airport[] = [
  { iata: 'KIX', name: 'Kansai International', city: 'Osaka', country: 'Japan', latitude: 34.4347, longitude: 135.2441 },
  { iata: 'SJC', name: 'San Jose Mineta International', city: 'San Jose', country: 'USA', latitude: 37.3639, longitude: -121.9289 },
  { iata: 'PDX', name: 'Portland International', city: 'Portland', country: 'USA', latitude: 45.5898, longitude: -122.5951 },
  { iata: 'ANC', name: 'Ted Stevens Anchorage International', city: 'Anchorage', country: 'USA', latitude: 61.1743, longitude: -149.9985 },
  { iata: 'HNL', name: 'Daniel K. Inouye International', city: 'Honolulu', country: 'USA', latitude: 21.3187, longitude: -157.9225 },
  { iata: 'GIG', name: 'Rio de Janeiro–Galeão', city: 'Rio de Janeiro', country: 'Brazil', latitude: -22.8090, longitude: -43.2506 },
  { iata: 'PER', name: 'Perth Airport', city: 'Perth', country: 'Australia', latitude: -31.9403, longitude: 115.9672 },
  { iata: 'CPT', name: 'Cape Town International', city: 'Cape Town', country: 'South Africa', latitude: -33.9696, longitude: 18.5975 },
  { iata: 'ADD', name: 'Addis Ababa Bole International', city: 'Addis Ababa', country: 'Ethiopia', latitude: 8.9779, longitude: 38.7993 },
  { iata: 'ICN2', name: 'Incheon Cargo Terminal Demo', city: 'Seoul', country: 'South Korea', latitude: 37.4450, longitude: 126.4500 },
];

export const DEMO_AIRPORTS: Airport[] = [...MAJOR_AIRPORTS, ...EXTRA_AIRPORTS];
