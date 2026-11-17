import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSources, connectionHeaders, disconnectSources, readConnection } from './connections';

const key = 'aerogrid.connection';
const previous = { token: 'a'.repeat(64), expiresAt: '2026-11-17T12:00:00Z', flightSource: 'adsb.lol', shipSource: 'fintraffic' };
const next = { ...previous, token: 'b'.repeat(64), flightSource: 'airplanes.live' };
const preferences = { flightSource: 'airplanes.live' as const, shipSource: 'fintraffic' as const };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); window.sessionStorage.clear(); });

describe('connection replacement', () => {
  it('rejects failed persistence, preserves the previous connection and revokes only the unretained session', async () => {
    window.sessionStorage.setItem(key, JSON.stringify(previous));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(next)).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    await expect(connectSources(preferences)).rejects.toThrow('Browser storage is unavailable');
    expect(readConnection()).toEqual(previous);
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'DELETE', headers: { Authorization: `Bearer ${next.token}` } });
  });
  it('persists the replacement before revoking the old connection', async () => {
    window.sessionStorage.setItem(key, JSON.stringify(previous));
    let connectionAtRevocation: unknown;
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(next)).mockImplementationOnce(async () => {
      connectionAtRevocation = readConnection();
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetch);
    await expect(connectSources(preferences)).resolves.toEqual(next);
    expect(connectionAtRevocation).toEqual(next);
    expect(connectionHeaders()).toEqual({ Authorization: `Bearer ${next.token}` });
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'DELETE', headers: { Authorization: `Bearer ${previous.token}` } });
  });
  it('keeps the old connection when creating a replacement fails', async () => {
    window.sessionStorage.setItem(key, JSON.stringify(previous));
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ message: 'Unavailable' }, { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(connectSources(preferences)).rejects.toThrow('Unavailable');
    expect(readConnection()).toEqual(previous);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('clears the local connection even when server revocation fails', async () => {
    window.sessionStorage.setItem(key, JSON.stringify(previous));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await disconnectSources();
    expect(readConnection()).toBeNull();
  });
});
