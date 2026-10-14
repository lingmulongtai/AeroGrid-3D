export interface OrbitalElements {
  [key: string]: string | number;
  OBJECT_NAME: string;
  OBJECT_ID: string;
  ELEMENT_SET_NO: number;
  NORAD_CAT_ID: number;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
}

export const ORBITAL_ELEMENT_FIELDS = [
  'OBJECT_NAME', 'OBJECT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY',
  'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY',
  'NORAD_CAT_ID', 'ELEMENT_SET_NO', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT',
] as const satisfies readonly (keyof OrbitalElements)[];

export type SatelliteCategory = 'station' | 'starlink' | 'broadband' | 'navigation' | 'geostationary' | 'earth-observation';

export function satelliteCategory(elements: OrbitalElements): SatelliteCategory {
  return elements.NORAD_CAT_ID === 25544 || elements.NORAD_CAT_ID === 48274 ? 'station'
    : /STARLINK/i.test(elements.OBJECT_NAME) ? 'starlink'
    : /ONEWEB|IRIDIUM/i.test(elements.OBJECT_NAME) ? 'broadband'
    : /GPS|GALILEO|GLONASS|BEIDOU/i.test(elements.OBJECT_NAME) ? 'navigation'
    : elements.MEAN_MOTION < 1.1 ? 'geostationary' : 'earth-observation';
}
export interface CloudProfile {
  longitude: number;
  latitude: number;
  validTime: string;
  groundAltitudeKm: number;
  footprintKm: number;
  levels: Array<{ pressureHpa: number; altitudeKm: number; coverPercent: number }>;
}
export interface ShipRecord {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  heading: number;
  speedKnots: number;
  receivedAt: string;
  source: 'fintraffic' | 'aisstream';
}
export interface PublicCamera {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  imageUrl: string;
  pageUrl: string;
  source: 'fintraffic' | 'youtube';
  videoId?: string;
}
export type FlightSource = 'adsb.lol' | 'airplanes.live' | 'adsbexchange';
export interface ConnectionPreferences {
  flightSource: FlightSource;
  shipSource: 'fintraffic' | 'aisstream';
  rapidApiKey?: string;
  aisStreamKey?: string;
}
