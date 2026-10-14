import fs from 'node:fs/promises';
import type { OrbitalElements } from '../shared/live';
import { syntheticElements } from './fixtures';

const CACHE = new URL('../.cache/satellite-bench/omm.json', import.meta.url);
const TWO_HOURS = 2 * 60 * 60_000;
interface Catalog { fetchedAt: number; elements: OrbitalElements[]; blocked?: boolean }
export async function loadCatalog(): Promise<{ kind: string; elements: OrbitalElements[]; time: number }> {
  const now = Date.now();
  if (process.env.SATELLITE_BENCH_SYNTHETIC === '1') return { kind: 'synthetic (forced, 25% deep-space)', elements: syntheticElements(5000, now), time: now };
  let saved: Catalog | undefined;
  for (const url of [CACHE, new URL('../.cache/orbits.json', import.meta.url)]) {
    try {
      const value = JSON.parse(await fs.readFile(url, 'utf8')) as Catalog;
      if (value.elements?.length >= 4200 && now - value.fetchedAt < TWO_HOURS) return { kind: 'CelesTrak active (local cache)', elements: value.elements, time: now };
      if (url === CACHE) saved = value;
      // A runtime/operator failure latch must not be bypassed by this benchmark.
      if (value.blocked || now - value.fetchedAt < TWO_HOURS) saved = { ...value, blocked: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') saved = { fetchedAt: now, elements: [], blocked: true };
    }
  }
  if (!saved?.blocked && (!saved || now - saved.fetchedAt >= TWO_HOURS)) {
    await fs.mkdir(new URL('.', CACHE), { recursive: true });
    await fs.writeFile(CACHE, JSON.stringify({ fetchedAt: now, blocked: true, elements: [] }));
    try {
      const response = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json', { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const elements = await response.json();
      if (!Array.isArray(elements) || elements.length < 4200) throw new Error('Invalid active OMM catalog');
      await fs.writeFile(CACHE, JSON.stringify({ fetchedAt: now, elements }));
      return { kind: 'CelesTrak active (one network download)', elements, time: now };
    } catch (error) { console.log(`CelesTrak unavailable; latch retained: ${String(error)}`); }
  }
  return { kind: 'synthetic (offline/paused, 25% deep-space)', elements: syntheticElements(5000, now), time: now };
}
