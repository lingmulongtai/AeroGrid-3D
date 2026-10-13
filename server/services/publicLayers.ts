import type { DataCoverage, DataSnapshot } from '../../shared/contracts.js';
import type { CloudProfile, PublicCamera, ShipRecord } from '../../shared/live.js';
import { fetchCloudProfiles } from '../providers/cloudProfiles.js';
import { fetchFintrafficShips, fetchPublicCameras } from '../providers/fintraffic.js';
import { OrbitProvider } from '../providers/orbits.js';
import type { FlightQuery } from './atlasData.js';
import { DailyQuota } from '../lib/quota.js';

export class PublicLayers {
  readonly orbits = new OrbitProvider();
  private cache = new Map<string, DataSnapshot<any>>();
  private pending = new Map<string, Promise<DataSnapshot<any>>>();
  private retryAfter = new Map<string, number>();
  private cloudQuota = new DailyQuota(400);
  private nextCloudRequestAt = 0;
  constructor(private readonly fetchFn = fetch, private readonly now = Date.now) {}
  clouds(query: FlightQuery) {
    const normalized = { latitude: Math.round(query.latitude * 10) / 10, longitude: Math.round(query.longitude * 10) / 10, radiusNm: Math.ceil(query.radiusNm / 5) * 5 };
    const key = `clouds:${normalized.latitude}:${normalized.longitude}:${normalized.radiusNm}`;
    return this.get<CloudProfile>(key, 'open-meteo-gfs', { kind: 'radius', center: { latitude: normalized.latitude, longitude: normalized.longitude }, radiusNm: normalized.radiusNm }, 30 * 60_000, () => {
      if (this.now() < this.nextCloudRequestAt) throw new Error('GFS request pacing; retry shortly');
      this.nextCloudRequestAt = this.now() + 2000;
      if (!this.cloudQuota.tryTake(this.now())) throw new Error('Daily GFS request budget exhausted');
      return fetchCloudProfiles(normalized, this.fetchFn, this.now());
    });
  }
  ships() { return this.get<ShipRecord>('ships', 'fintraffic', { kind: 'region', name: 'Finnish waterways / Baltic receiver coverage' }, 60_000, () => fetchFintrafficShips(this.fetchFn, this.now()), 'Class A, no fishing vessels'); }
  cameras() { return this.get<PublicCamera>('cameras', 'fintraffic', { kind: 'region', name: 'Finland' }, 60 * 60_000, () => fetchPublicCameras(this.fetchFn), 'Official weather cameras; still images, roughly 10-minute updates'); }
  private async get<T>(key: string, source: string, coverage: DataCoverage, ttl: number, load: () => Promise<T[]>, message?: string): Promise<DataSnapshot<T>> {
    const cached = this.cache.get(key);
    if (cached && Date.parse(cached.expiresAt) > this.now()) return cached;
    if (this.pending.has(key)) return this.pending.get(key)!;
    const run = async (): Promise<DataSnapshot<T>> => {
      let attempted = false;
      try {
        if ((this.retryAfter.get(key) ?? 0) > this.now()) throw new Error('Source retry paused after failure');
        if (this.pending.size >= 4) throw new Error('Live data request queue is full; retry shortly');
        attempted = true;
        const items = await load();
        const snapshot: DataSnapshot<T> = { mode: 'live-beta', source, status: 'available', generatedAt: new Date(this.now()).toISOString(), expiresAt: new Date(this.now() + ttl).toISOString(), coverage, items, message };
        if (this.cache.size >= 64) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, snapshot);
        this.retryAfter.delete(key);
        return snapshot;
      } catch (error) {
        if (attempted) {
          if (this.retryAfter.size >= 64) this.retryAfter.delete(this.retryAfter.keys().next().value!);
          this.retryAfter.set(key, this.now() + 60_000);
        }
        const failure = error instanceof Error ? error.message : 'Source unavailable';
        if (cached && this.now() - Date.parse(cached.expiresAt) < 5 * 60_000) return { ...cached, status: 'stale', message: failure };
        return { mode: 'live-beta', source, status: 'unavailable', generatedAt: new Date(this.now()).toISOString(), expiresAt: new Date(this.now()).toISOString(), coverage, items: [], message: failure };
      }
    };
    const promise = run().finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
}
