import path from 'node:path';
import type { DataSnapshot } from '../../shared/contracts.js';
import type { OrbitalElements } from '../../shared/live.js';
import { ProviderError } from './errors.js';
import { CacheConflict, orbitCacheStore, type OrbitCacheStore } from './orbitCache.js';

const REFRESH_MS = 2 * 60 * 60_000;
const MAX_CACHE_AGE_MS = 24 * 60 * 60_000;
interface OrbitCache { fetchedAt: number; blocked?: string; elements: OrbitalElements[] }
export function validElements(value: any): value is OrbitalElements {
  return typeof value?.OBJECT_NAME === 'string' && typeof value.OBJECT_ID === 'string' && Number.isInteger(value.ELEMENT_SET_NO) && typeof value.EPOCH === 'string' && Number.isInteger(value.NORAD_CAT_ID)
    && Number.isFinite(Date.parse(`${value.EPOCH.replace(/Z$/, '')}Z`))
    && ['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT'].every((key) => Number.isFinite(value[key]))
    && value.MEAN_MOTION > 0 && value.ECCENTRICITY >= 0 && value.ECCENTRICITY < 1;
}
export class OrbitProvider {
  private pending?: Promise<DataSnapshot<OrbitalElements>>;
  private cached?: DataSnapshot<OrbitalElements>;
  private store: OrbitCacheStore;
  constructor(cachePath = process.env.ORBIT_CACHE_PATH ?? path.resolve('.cache/orbits.json'), private readonly fetchFn = fetch, private readonly now = Date.now, store?: OrbitCacheStore) {
    this.store = store ?? orbitCacheStore(cachePath);
  }
  getSnapshot() {
    if (this.cached?.status === 'available' && Date.parse(this.cached.expiresAt) > this.now()) return Promise.resolve(this.cached);
    if (!this.pending) this.pending = this.load().then((snapshot) => { this.cached = snapshot; return snapshot; }).finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async load(conflictRetry = true): Promise<DataSnapshot<OrbitalElements>> {
    let cache: OrbitCache = { fetchedAt: 0, elements: [] };
    let version: string | undefined;
    if (process.env.NODE_ENV === 'production' && !process.env.ORBIT_CACHE_PATH) return this.snapshot(cache, 'unavailable', 'Set ORBIT_CACHE_PATH on persistent storage before enabling production orbital downloads');
    try {
      const stored = await this.store.read();
      version = stored?.version;
      if (stored) {
        const parsed = JSON.parse(stored.contents);
        if (!Array.isArray(parsed.elements) || parsed.elements.some((element: unknown) => !validElements(element)) || (parsed.fetchedAt > 0 && !parsed.elements.length) || !Number.isFinite(parsed.fetchedAt) || parsed.fetchedAt < 0 || parsed.fetchedAt > this.now() + 60_000) throw new Error('Invalid orbital cache; inspect before retrying');
        cache = parsed;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return this.snapshot(cache, 'unavailable', 'Orbital cache unreadable; automatic downloads paused');
    }
    if (!cache.blocked && this.now() - cache.fetchedAt >= REFRESH_MS) {
      try {
        // Verify durable storage BEFORE requesting, including a persisted failure latch.
        version = await this.store.write(JSON.stringify({ ...cache, blocked: 'Orbital refresh interrupted; inspect cache before retrying' }), version);
        const response = await this.fetchFn('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json', { signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new ProviderError(`CelesTrak HTTP ${response.status}; automatic downloads paused`, response.status);
        const payload = await response.json();
        if (!Array.isArray(payload)) throw new ProviderError('CelesTrak returned invalid OMM');
        const elements = payload.filter(validElements);
        if (!elements.length) throw new ProviderError('CelesTrak returned no valid orbital elements');
        cache = { fetchedAt: this.now(), elements };
        version = await this.store.write(JSON.stringify(cache), version);
      } catch (error) {
        if (error instanceof CacheConflict) return conflictRetry ? this.load(false) : this.snapshot(cache, 'unavailable', 'Orbital cache changed; retry on the next poll');
        cache.blocked = error instanceof Error ? error.message : 'Orbital download paused';
        try { await this.store.write(JSON.stringify(cache), version); } catch { /* Continue paused; no download without durable cache. */ }
      }
    }
    const age = this.now() - cache.fetchedAt;
    const status = age > MAX_CACHE_AGE_MS || !cache.elements.length ? 'unavailable' : cache.blocked || age >= REFRESH_MS ? 'stale' : 'available';
    return this.snapshot(cache, status, cache.blocked);
  }
  private snapshot(cache: OrbitCache, status: DataSnapshot<OrbitalElements>['status'], message?: string): DataSnapshot<OrbitalElements> {
    return { mode: 'live-beta', source: 'celestrak', status, generatedAt: new Date(cache.fetchedAt || this.now()).toISOString(), expiresAt: new Date(cache.fetchedAt + REFRESH_MS).toISOString(), coverage: { kind: 'global' }, items: status === 'unavailable' ? [] : cache.elements, message };
  }
}
