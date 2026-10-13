import fs from 'node:fs/promises';
import path from 'node:path';
import { Storage } from '@google-cloud/storage';

export interface CacheRead { contents: string; version?: string }
export interface OrbitCacheStore {
  read(): Promise<CacheRead | null>;
  write(contents: string, expectedVersion?: string): Promise<string | undefined>;
}
export class CacheConflict extends Error {}

export function orbitCacheStore(location: string): OrbitCacheStore {
  if (!location.startsWith('gs://')) return {
    async read() {
      try { return { contents: await fs.readFile(location, 'utf8') }; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    },
    async write(contents) {
      await fs.mkdir(path.dirname(location), { recursive: true });
      await fs.writeFile(`${location}.tmp`, contents, { mode: 0o600 });
      await fs.rename(`${location}.tmp`, location);
      return undefined;
    },
  };
  const url = new URL(location);
  const storage = new Storage({ retryOptions: { totalTimeout: 15, maxRetries: 2 } });
  const objectName = decodeURIComponent(url.pathname.slice(1));
  if (!url.hostname || !objectName) throw new Error('Invalid Cloud Storage orbital cache location');
  const bucket = storage.bucket(url.hostname);
  return {
    async read() {
      let generation: string;
      try {
        const [metadata] = await bucket.file(objectName).getMetadata();
        if (!metadata.generation) throw new Error('Orbital cache generation missing');
        generation = String(metadata.generation);
      } catch (error) { if ((error as { code?: number }).code === 404) return null; throw error; }
      // Read the exact generation whose version will guard the next write.
      const [contents] = await bucket.file(objectName, { generation }).download();
      return { contents: contents.toString('utf8'), version: generation };
    },
    async write(contents, expectedVersion) {
      const file = bucket.file(objectName);
      try {
        await file.save(contents, { resumable: false, contentType: 'application/json', preconditionOpts: { ifGenerationMatch: expectedVersion ?? 0 } });
      } catch (error) {
        if ((error as { code?: number }).code === 412) throw new CacheConflict('Another server updated the orbital cache');
        throw error;
      }
      const [metadata] = await file.getMetadata();
      if (!metadata.generation) throw new Error('Orbital cache generation missing');
      return String(metadata.generation);
    },
  };
}
