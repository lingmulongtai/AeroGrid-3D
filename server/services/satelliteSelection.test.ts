import { describe, expect, it } from 'vitest';
import { syntheticElements, FIXTURE_EPOCH } from '../../bench/fixtures';
import { ORBITAL_ELEMENT_FIELDS, satelliteCategory } from '../../shared/live';
import { selectSatelliteCatalog } from './satelliteSelection';

function mixedCatalog() {
  const elements = syntheticElements(6000);
  return elements.map((element, index) => ({ ...element,
    NORAD_CAT_ID: index === 0 ? 25544 : index === 1 ? 48274 : element.NORAD_CAT_ID,
    OBJECT_NAME: index < 2 ? 'SPACE STATION' : index < 4400 ? `STARLINK-${index}` : index < 4700 ? `ONEWEB-${index}` : index < 4800 ? `GPS ${index}` : `OTHER ${index}`,
    MEAN_MOTION: index >= 4800 && index < 5000 ? 1.0027 : element.MEAN_MOTION,
    CLASSIFICATION_TYPE: 'U', EPHEMERIS_TYPE: 0, REV_AT_EPOCH: index,
  }));
}

describe('satellite delivery selection', () => {
  it('projects only the 14 OMM fields without mutating the durable source', () => {
    const source = mixedCatalog().slice(0, 5);
    const copy = structuredClone(source);
    for (const element of selectSatelliteCatalog(source, FIXTURE_EPOCH)) expect(Object.keys(element)).toEqual(ORBITAL_ELEMENT_FIELDS);
    expect(source).toEqual(copy);
  });

  it('is deterministic, prefix stable, and includes every category by 300', () => {
    const source = mixedCatalog();
    const selected = selectSatelliteCatalog(source, FIXTURE_EPOCH);
    expect(selectSatelliteCatalog([...source].reverse(), FIXTURE_EPOCH)).toEqual(selected);
    expect(selected.slice(0, 2).map((element) => element.NORAD_CAT_ID)).toEqual([25544, 48274]);
    for (const limit of [300, 1200, 2400, 4200]) {
      const prefix = selected.slice(0, limit);
      expect(prefix).toHaveLength(limit);
      expect(new Set(prefix.map(satelliteCategory))).toEqual(new Set(['station', 'starlink', 'broadband', 'navigation', 'geostationary', 'earth-observation']));
      expect(prefix.slice(0, 300)).toEqual(selected.slice(0, 300));
    }
    expect(new Set(selected.map((element) => element.NORAD_CAT_ID)).size).toBe(selected.length);
    const starlinkIds = selected.filter((element) => satelliteCategory(element) === 'starlink').slice(0, 15).map((element) => element.NORAD_CAT_ID);
    expect(Math.min(...starlinkIds)).toBeLessThan(100_500);
    expect(Math.max(...starlinkIds)).toBeGreaterThan(104_000);
  });

  it('excludes old/future elements and SGP4 failures, retaining inclusive age boundaries', () => {
    const [base] = syntheticElements(1);
    const epoch = (days: number) => new Date(FIXTURE_EPOCH + days * 86_400_000).toISOString().replace(/Z$/, '');
    const input = [
      { ...base, NORAD_CAT_ID: 1, EPOCH: epoch(-14) },
      { ...base, NORAD_CAT_ID: 2, EPOCH: epoch(1) },
      { ...base, NORAD_CAT_ID: 3, EPOCH: epoch(-14 - 1 / 86_400) },
      { ...base, NORAD_CAT_ID: 4, EPOCH: epoch(1 + 1 / 86_400) },
      { ...base, NORAD_CAT_ID: 5, MEAN_MOTION: 50 }, // Below the Earth; sgp4 error 6.
      { ...base, NORAD_CAT_ID: 6, INCLINATION: NaN },
    ];
    expect(selectSatelliteCatalog(input, FIXTURE_EPOCH).map((element) => element.NORAD_CAT_ID).sort()).toEqual([1, 2]);
  });
});
