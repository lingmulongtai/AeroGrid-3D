export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class ExpiringCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  getFresh(key: string, nowMs = Date.now()): T | null {
    const entry = this.entries.get(key);
    return entry && entry.expiresAt >= nowMs ? entry.value : null;
  }

  getWithinStaleWindow(key: string, staleWindowMs: number, nowMs = Date.now()): T | null {
    const entry = this.entries.get(key);
    return entry && entry.expiresAt + staleWindowMs >= nowMs ? entry.value : null;
  }

  set(key: string, value: T, ttlMs: number, nowMs = Date.now()): void {
    this.entries.set(key, { value, expiresAt: nowMs + ttlMs });
  }

  clear(): void {
    this.entries.clear();
  }
}
