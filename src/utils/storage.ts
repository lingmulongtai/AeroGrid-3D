/**
 * Web Storage can throw on every access: Safari private browsing, blocked
 * third-party storage, a full quota, or an embedding policy. Preferences are a
 * convenience, so a failure degrades to in-memory behaviour instead of
 * preventing the atlas from starting.
 */
type StorageKind = 'local' | 'session';

function area(kind: StorageKind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStored(key: string, kind: StorageKind = 'local'): string | null {
  try {
    return area(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Returns false when the value could not be persisted. */
export function writeStored(key: string, value: string, kind: StorageKind = 'local'): boolean {
  try {
    const storage = area(kind);
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStored(key: string, kind: StorageKind = 'local'): void {
  try {
    area(kind)?.removeItem(key);
  } catch {
    // Nothing was stored if storage is unavailable.
  }
}
