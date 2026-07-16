export type SatelliteCategory = 'station' | 'earth-observation' | 'navigation' | 'communications';

type SatelliteOrbit = {
  id: string;
  name: string;
  category: SatelliteCategory;
  altitude: number;
  inclination: number;
  periodMinutes: number;
  ascendingNode: number;
  phase: number;
};

export type SatellitePreviewRecord = SatelliteOrbit & {
  longitude: number;
  latitude: number;
  heading: number;
};

const ORBITS: SatelliteOrbit[] = [
  {id: 'station-01', name: 'Orbital Station', category: 'station', altitude: 420_000, inclination: 51.6, periodMinutes: 92.7, ascendingNode: 18, phase: 12},
  {id: 'leo-01', name: 'LEO Explorer 01', category: 'earth-observation', altitude: 540_000, inclination: 97.4, periodMinutes: 95.3, ascendingNode: -148, phase: 26},
  {id: 'leo-02', name: 'LEO Explorer 02', category: 'earth-observation', altitude: 610_000, inclination: 97.8, periodMinutes: 96.8, ascendingNode: -82, phase: 171},
  {id: 'leo-03', name: 'LEO Explorer 03', category: 'earth-observation', altitude: 705_000, inclination: 98.2, periodMinutes: 98.8, ascendingNode: 34, phase: 282},
  {id: 'leo-04', name: 'Climate Mapper 01', category: 'earth-observation', altitude: 824_000, inclination: 98.7, periodMinutes: 101.1, ascendingNode: 112, phase: 74},
  {id: 'leo-05', name: 'Climate Mapper 02', category: 'earth-observation', altitude: 760_000, inclination: 98.5, periodMinutes: 99.8, ascendingNode: 167, phase: 214},
  {id: 'com-01', name: 'Relay 01', category: 'communications', altitude: 1_150_000, inclination: 53, periodMinutes: 108.5, ascendingNode: -165, phase: 41},
  {id: 'com-02', name: 'Relay 02', category: 'communications', altitude: 1_150_000, inclination: 53, periodMinutes: 108.5, ascendingNode: -105, phase: 161},
  {id: 'com-03', name: 'Relay 03', category: 'communications', altitude: 1_150_000, inclination: 53, periodMinutes: 108.5, ascendingNode: -45, phase: 281},
  {id: 'com-04', name: 'Relay 04', category: 'communications', altitude: 1_150_000, inclination: 53, periodMinutes: 108.5, ascendingNode: 15, phase: 101},
  {id: 'com-05', name: 'Relay 05', category: 'communications', altitude: 1_150_000, inclination: 53, periodMinutes: 108.5, ascendingNode: 75, phase: 221},
  {id: 'com-06', name: 'Relay 06', category: 'communications', altitude: 1_150_000, inclination: 53, periodMinutes: 108.5, ascendingNode: 135, phase: 341},
  {id: 'nav-01', name: 'Navigation 01', category: 'navigation', altitude: 20_200_000, inclination: 55, periodMinutes: 718, ascendingNode: -150, phase: 22},
  {id: 'nav-02', name: 'Navigation 02', category: 'navigation', altitude: 20_200_000, inclination: 55, periodMinutes: 718, ascendingNode: -90, phase: 142},
  {id: 'nav-03', name: 'Navigation 03', category: 'navigation', altitude: 20_200_000, inclination: 55, periodMinutes: 718, ascendingNode: -30, phase: 262},
  {id: 'nav-04', name: 'Navigation 04', category: 'navigation', altitude: 23_222_000, inclination: 56, periodMinutes: 844, ascendingNode: 30, phase: 82},
  {id: 'nav-05', name: 'Navigation 05', category: 'navigation', altitude: 23_222_000, inclination: 56, periodMinutes: 844, ascendingNode: 90, phase: 202},
  {id: 'nav-06', name: 'Navigation 06', category: 'navigation', altitude: 23_222_000, inclination: 56, periodMinutes: 844, ascendingNode: 150, phase: 322},
];

const EARTH_ROTATION_MS = 86_164_000;
const radians = (degrees: number) => degrees * Math.PI / 180;
const degrees = (angle: number) => angle * 180 / Math.PI;
const wrapLongitude = (longitude: number) => ((longitude + 540) % 360) - 180;

function positionForOrbit(orbit: SatelliteOrbit, timeMs: number) {
  const orbitalPeriodMs = orbit.periodMinutes * 60_000;
  const orbitalAngle = radians(orbit.phase)
    + ((timeMs % orbitalPeriodMs) / orbitalPeriodMs) * Math.PI * 2;
  const inclination = radians(orbit.inclination);
  const latitude = Math.asin(Math.sin(inclination) * Math.sin(orbitalAngle));
  const argument = Math.atan2(
    Math.cos(inclination) * Math.sin(orbitalAngle),
    Math.cos(orbitalAngle),
  );
  const earthRotation = ((timeMs % EARTH_ROTATION_MS) / EARTH_ROTATION_MS) * Math.PI * 2;
  return {
    longitude: wrapLongitude(orbit.ascendingNode + degrees(argument - earthRotation)),
    latitude: degrees(latitude),
  };
}

export function getSatellitePreview(timeMs: number): SatellitePreviewRecord[] {
  return ORBITS.map((orbit) => {
    const position = positionForOrbit(orbit, timeMs);
    const next = positionForOrbit(orbit, timeMs + 5_000);
    const heading = (degrees(Math.atan2(
      radians(next.longitude - position.longitude) * Math.cos(radians(position.latitude)),
      radians(next.latitude - position.latitude),
    )) + 360) % 360;
    return {...orbit, ...position, heading};
  });
}

export function getSatelliteOrbitPath(
  satellite: SatellitePreviewRecord,
  timeMs: number,
  samples = 96,
) {
  const periodMs = satellite.periodMinutes * 60_000;
  return Array.from({length: samples + 1}, (_, index) => {
    const position = positionForOrbit(satellite, timeMs + (index / samples) * periodMs);
    return [position.longitude, position.latitude, satellite.altitude] as const;
  });
}
