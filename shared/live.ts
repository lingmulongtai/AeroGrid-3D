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
