import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';
import type { DataSnapshot } from '../../shared/contracts.js';
import type { OrbitalElements } from '../../shared/live.js';
import { selectSatelliteCatalog } from './satelliteSelection.js';

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);
export type SatelliteEncoding = 'identity' | 'gzip' | 'br';
interface Representation { body: Buffer; etag: string; encoding: SatelliteEncoding }
interface Delivery { body: Buffer; etag?: string; encoding: SatelliteEncoding; maxAge: number; cacheable: boolean }
interface Source { getSnapshot(): Promise<DataSnapshot<OrbitalElements>> }

/** In-memory delivery cache, independent of the full, durable provider cache. */
export class SatellitePayload {
  private generation?: string;
  private metadata?: string;
  private selected: OrbitalElements[] = [];
  private limits = new Map<number, { body: Buffer; variants: Map<SatelliteEncoding, Promise<Representation>> }>();

  constructor(private readonly source: Source, private readonly now = Date.now) {}

  async get(limit: number, encoding: SatelliteEncoding = 'identity'): Promise<Delivery> {
    const snapshot = await this.source.getSnapshot();
    if (snapshot.status === 'unavailable') {
      return { body: Buffer.from(JSON.stringify(snapshot)), encoding: 'identity', maxAge: 0, cacheable: false };
    }
    if (snapshot.generatedAt !== this.generation) {
      // Using fetchedAt as the validation clock makes the generation identical
      // across limits, regions and restarts. Clients still check age at display time.
      this.selected = selectSatelliteCatalog(snapshot.items, Date.parse(snapshot.generatedAt));
      this.generation = snapshot.generatedAt;
      this.limits.clear();
    }
    const metadata = JSON.stringify([snapshot.status, snapshot.expiresAt, snapshot.message]);
    if (metadata !== this.metadata) { this.metadata = metadata; this.limits.clear(); }
    let entry = this.limits.get(limit);
    if (!entry) {
      entry = { body: Buffer.from(JSON.stringify({ ...snapshot, items: this.selected.slice(0, limit) })), variants: new Map() };
      // Bound arbitrary ?limit values while retaining the four quality presets.
      if (this.limits.size >= 16) this.limits.delete(this.limits.keys().next().value!);
    }
    this.limits.delete(limit);
    this.limits.set(limit, entry);
    let representation = entry.variants.get(encoding);
    if (!representation) {
      representation = this.encode(entry.body, snapshot.generatedAt, limit, encoding);
      entry.variants.set(encoding, representation);
      void representation.catch(() => entry.variants.delete(encoding));
    }
    return { ...await representation, cacheable: true, maxAge: Math.max(0, Math.min(600, Math.floor((Date.parse(snapshot.expiresAt) - this.now()) / 1000))) };
  }

  private async encode(json: Buffer, generation: string, limit: number, encoding: SatelliteEncoding): Promise<Representation> {
    const body = encoding === 'gzip' ? await gzipAsync(json)
      : encoding === 'br' ? await brotliAsync(json, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }) : json;
    // Strong validators identify the actual encoded bytes, including metadata
    // transitions under the same fetchedAt and different requested limits.
    const digest = createHash('sha256').update(`${generation}:${limit}:${encoding}:`).update(body).digest('base64url');
    return { body, etag: `"sat-${digest}"`, encoding };
  }
}
