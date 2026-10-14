import { json2satrec, sgp4 } from 'satellite.js';
import { ORBITAL_ELEMENT_FIELDS, satelliteCategory, type OrbitalElements, type SatelliteCategory } from '../../shared/live.js';
import { validElements } from '../providers/orbits.js';

const DAY_MS = 86_400_000;
const MIN_CATEGORY_SHARE = 0.02;

function usable(elements: OrbitalElements, timeMs: number): boolean {
  if (!validElements(elements)) return false;
  const epoch = Date.parse(`${elements.EPOCH.replace(/Z$/, '')}Z`);
  if (timeMs - epoch > 14 * DAY_MS || epoch > timeMs + DAY_MS) return false;
  try {
    const satrec = json2satrec(elements);
    const state = sgp4(satrec, (timeMs / DAY_MS + 2440587.5 - satrec.jdsatepoch) * 1440);
    return !satrec.error && !!state && Object.values(state.position).every(Number.isFinite);
  } catch { return false; }
}

/** Breadth-first interval midpoints spread every prefix across the NORAD range. */
function spread(elements: OrbitalElements[]): OrbitalElements[] {
  const ordered = [...elements].sort((a, b) => a.NORAD_CAT_ID - b.NORAD_CAT_ID);
  const ranges: Array<[number, number]> = [[0, ordered.length]];
  const result: OrbitalElements[] = [];
  for (let cursor = 0; cursor < ranges.length; cursor++) {
    const [start, end] = ranges[cursor];
    if (start >= end) continue;
    const middle = Math.floor((start + end) / 2);
    result.push(ordered[middle]);
    if (start < middle) ranges.push([start, middle]);
    if (middle + 1 < end) ranges.push([middle + 1, end]);
  }
  return result;
}

/** Derived delivery view only: never project or reorder the durable orbit cache. */
export function selectSatelliteCatalog(elements: OrbitalElements[], timeMs: number): OrbitalElements[] {
  const categories: SatelliteCategory[] = ['station', 'starlink', 'broadband', 'navigation', 'geostationary', 'earth-observation'];
  const groups = new Map(categories.map((category) => [category, [] as OrbitalElements[]]));
  for (const element of elements) {
    if (usable(element, timeMs)) groups.get(satelliteCategory(element))!.push(element);
  }
  const result = groups.get('station')!.sort((a, b) => a.NORAD_CAT_ID - b.NORAD_CAT_ID);
  const population = [...groups.values()].reduce((sum, group) => sum + group.length, 0) || 1;
  const active = categories.filter((category) => category !== 'station' && groups.get(category)!.length).map((category) => {
    const items = spread(groups.get(category)!);
    return { items, index: 0, weight: Math.max(MIN_CATEGORY_SHARE, items.length / population), credit: 0 };
  });
  // Smooth weighted round robin: each nonempty category has at least 2% weight.
  while (active.length) {
    let best = active[0], total = 0;
    for (const group of active) {
      group.credit += group.weight;
      total += group.weight;
      if (group.credit > best.credit) best = group;
    }
    best.credit -= total;
    result.push(best.items[best.index++]);
    if (best.index === best.items.length) active.splice(active.indexOf(best), 1);
  }
  return result.map((element) => Object.fromEntries(ORBITAL_ELEMENT_FIELDS.map((key) => [key, element[key]])) as OrbitalElements);
}
