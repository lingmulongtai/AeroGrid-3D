import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStored, removeStored, writeStored } from './storage';

afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); window.sessionStorage.clear(); });

describe('guarded web storage', () => {
  it('round-trips values in the selected storage area', () => {
    expect(writeStored('k', 'local-value')).toBe(true);
    expect(writeStored('k', 'session-value', 'session')).toBe(true);
    expect(readStored('k')).toBe('local-value');
    expect(readStored('k', 'session')).toBe('session-value');
    removeStored('k');
    expect(readStored('k')).toBeNull();
    expect(readStored('k', 'session')).toBe('session-value');
  });

  it('degrades to defaults instead of throwing when storage is blocked', () => {
    const denied = () => { throw new DOMException('denied', 'SecurityError'); };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(denied);
    expect(readStored('k')).toBeNull();
    expect(writeStored('k', 'v')).toBe(false);
    expect(() => removeStored('k')).not.toThrow();
  });
});
