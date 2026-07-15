import type { FlightCategory } from '../../shared/contracts';

export type AircraftCategory = FlightCategory;

// OpenSky Network category field (state[17]) mapping
// Color by altitude: low=orange, mid=yellow, high=cyan/blue
export function getAltitudeColor(altitude: number): [number, number, number, number] {
  if (altitude < 3000) return [255, 100, 0, 220];
  if (altitude < 6000) return [255, 180, 0, 220];
  if (altitude < 9000) return [255, 220, 0, 220];
  if (altitude < 12000) return [100, 220, 255, 220];
  return [0, 180, 255, 220];
}

// Color by speed (m/s)
export function getSpeedColor(velocity: number): [number, number, number, number] {
  if (velocity < 50) return [100, 255, 100, 220];
  if (velocity < 150) return [255, 220, 0, 220];
  if (velocity < 250) return [255, 140, 0, 220];
  return [255, 50, 50, 220];
}

// Color by aircraft category
export function getCategoryColor(category: AircraftCategory): [number, number, number, number] {
  switch (category) {
    case 'heavy': return [255, 50, 50, 220];
    case 'large': return [255, 120, 0, 220];
    case 'medium': return [255, 220, 0, 220];
    case 'small': return [100, 255, 100, 220];
    case 'light': return [150, 200, 255, 220];
    case 'high_performance': return [255, 70, 190, 220];
    case 'rotorcraft': return [200, 0, 255, 220];
  }
}

export function getFlightColor(
  mode: 'altitude' | 'speed' | 'category',
  altitude: number,
  velocity: number,
  category: AircraftCategory
): [number, number, number, number] {
  switch (mode) {
    case 'altitude': return getAltitudeColor(altitude);
    case 'speed': return getSpeedColor(velocity);
    case 'category': return getCategoryColor(category);
  }
}

// Format altitude in meters → "FL350" for high altitude or "2,450 m" for low
export function formatAltitude(meters: number): string {
  if (meters >= 3000) {
    const fl = Math.round(meters / 30.48 / 100) * 100;
    return `FL${String(fl).padStart(3, '0')}`;
  }
  return `${Math.round(meters).toLocaleString()} m`;
}

// Format speed: m/s → knots and km/h
export function formatSpeed(ms: number): string {
  const kt = Math.round(ms * 1.94384);
  const kmh = Math.round(ms * 3.6);
  return `${kt} kt  (${kmh} km/h)`;
}

// Format heading to compass direction
export function formatHeading(degrees: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(degrees / 22.5) % 16;
  return `${Math.round(degrees)}° ${dirs[idx]}`;
}

// Country code → flag emoji
export function countryToFlag(countryName: string): string {
  const map: Record<string, string> = {
    'United States': '🇺🇸', 'China': '🇨🇳', 'United Kingdom': '🇬🇧', 'Germany': '🇩🇪',
    'France': '🇫🇷', 'Japan': '🇯🇵', 'Canada': '🇨🇦', 'Australia': '🇦🇺',
    'Brazil': '🇧🇷', 'India': '🇮🇳', 'Russia': '🇷🇺', 'South Korea': '🇰🇷',
    'Netherlands': '🇳🇱', 'Spain': '🇪🇸', 'Italy': '🇮🇹', 'Singapore': '🇸🇬',
    'United Arab Emirates': '🇦🇪', 'Turkey': '🇹🇷', 'Mexico': '🇲🇽',
    'Switzerland': '🇨🇭', 'Sweden': '🇸🇪', 'Norway': '🇳🇴', 'Denmark': '🇩🇰',
    'Finland': '🇫🇮', 'Poland': '🇵🇱', 'Austria': '🇦🇹', 'Belgium': '🇧🇪',
    'Portugal': '🇵🇹', 'Greece': '🇬🇷', 'Ireland': '🇮🇪', 'New Zealand': '🇳🇿',
    'South Africa': '🇿🇦', 'Argentina': '🇦🇷', 'Chile': '🇨🇱', 'Thailand': '🇹🇭',
    'Malaysia': '🇲🇾', 'Indonesia': '🇮🇩', 'Philippines': '🇵🇭', 'Vietnam': '🇻🇳',
    'Taiwan': '🇹🇼', 'Hong Kong': '🇭🇰', 'Israel': '🇮🇱', 'Saudi Arabia': '🇸🇦',
    'Qatar': '🇶🇦', 'Kuwait': '🇰🇼', 'Pakistan': '🇵🇰',
  };
  return map[countryName] ?? '🌐';
}

// Scale size multiplier per aircraft category
export function getCategoryScale(category: AircraftCategory): [number, number, number] {
  switch (category) {
    case 'heavy': return [3.5, 3.5, 3.5];
    case 'large': return [2.5, 2.5, 2.5];
    case 'medium': return [2.0, 2.0, 2.0];
    case 'small': return [1.2, 1.2, 1.2];
    case 'light': return [0.9, 0.9, 0.9];
    case 'high_performance': return [1.4, 1.4, 1.4];
    case 'rotorcraft': return [1.0, 1.0, 1.0];
  }
}

export function getCategorySizeScale(category: AircraftCategory): number {
  switch (category) {
    case 'heavy': return 60;
    case 'large': return 45;
    case 'medium': return 35;
    case 'small': return 22;
    case 'light': return 16;
    case 'high_performance': return 24;
    case 'rotorcraft': return 18;
  }
}
