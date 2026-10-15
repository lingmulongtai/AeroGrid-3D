import { Storage } from '@google-cloud/storage';

export interface BudgetRead { contents: string; generation: string }
export interface FlightBudgetStore {
  read(): Promise<BudgetRead | null>;
  compareAndSwap(contents: string, generation?: string): Promise<void>;
}
export class BudgetConflict extends Error {}

// Keep this separate from the orbital cache: no orbital payload/policy changes.
export function cloudFlightBudgetStore(location: string): FlightBudgetStore {
  const url = new URL(location);
  if (url.protocol !== 'gs:' || !url.hostname || !url.pathname.slice(1) || url.search || url.hash) {
    throw new Error('Aircraft budget requires a gs://bucket/object location');
  }
  const storage = new Storage({ retryOptions: { autoRetry: false }, timeout: 10_000 });
  const bucket = storage.bucket(url.hostname);
  const objectName = decodeURIComponent(url.pathname.slice(1));
  return {
    async read() {
      let generation: string;
      try {
        const [metadata] = await bucket.file(objectName).getMetadata();
        if (!metadata.generation) throw new Error('Aircraft budget generation missing');
        generation = String(metadata.generation);
      } catch (error) {
        if ((error as { code?: number }).code === 404) return null;
        throw error;
      }
      // Exact-generation reads cannot pair an old version with a new payload.
      // A replacement between metadata and download is retried by the caller.
      try {
        const [contents] = await bucket.file(objectName, { generation }).download();
        return { contents: contents.toString('utf8'), generation };
      } catch (error) {
        if ((error as { code?: number }).code === 404) throw new BudgetConflict();
        throw error;
      }
    },
    async compareAndSwap(contents, generation) {
      try {
        await bucket.file(objectName).save(contents, {
          resumable: false,
          contentType: 'application/json',
          metadata: { cacheControl: 'no-store' },
          preconditionOpts: { ifGenerationMatch: generation ?? 0 },
        });
      } catch (error) {
        if ((error as { code?: number }).code === 412) throw new BudgetConflict();
        // A timeout can mean committed. Never retry an uncertain reservation.
        throw error;
      }
    },
  };
}
