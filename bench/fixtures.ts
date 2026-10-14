import type { OrbitalElements } from '../shared/live';

export const FIXTURE_EPOCH = Date.UTC(2026, 9, 15);
export function syntheticElements(count: number, epochMs = FIXTURE_EPOCH): OrbitalElements[] {
  return Array.from({ length: count }, (_, index) => {
    // Every fourth record is deep-space; cycle navigation, GEO and eccentric HEO.
    const deep = index % 4 === 3 ? Math.floor(index / 4) % 3 : -1;
    return {
      OBJECT_NAME: deep === 0 ? `GPS BENCH ${index}` : `BENCH ${index}`,
      OBJECT_ID: `2026-${String(index).padStart(5, '0')}A`, NORAD_CAT_ID: 100_000 + index,
      EPOCH: new Date(epochMs).toISOString().replace(/Z$/, ''), ELEMENT_SET_NO: 999,
      MEAN_MOTION: deep === 0 ? 2.006 : deep === 1 ? 1.0027 : deep === 2 ? 2 : 15.2 + (index % 5) * 0.04,
      ECCENTRICITY: deep === 2 ? 0.74 : 0.0003,
      INCLINATION: deep === 0 ? 55 : deep === 1 ? 0.05 : deep === 2 ? 63.4 : index % 2 ? 97 : 53,
      RA_OF_ASC_NODE: (index * 47) % 360, ARG_OF_PERICENTER: deep === 2 ? 270 : 10,
      MEAN_ANOMALY: (index * 137) % 360, BSTAR: 0.00001, MEAN_MOTION_DOT: 0.000001, MEAN_MOTION_DDOT: 0,
    };
  });
}
