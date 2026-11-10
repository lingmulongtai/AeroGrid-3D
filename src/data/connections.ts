import type { ConnectionPreferences } from '../../shared/live';
import { readStored, removeStored, writeStored } from '../utils/storage';
export interface ConnectionSession { token: string; expiresAt: string; flightSource: ConnectionPreferences['flightSource']; shipSource: ConnectionPreferences['shipSource'] }
const SESSION_KEY = 'aerogrid.connection';
export function readConnection(): ConnectionSession | null {
  try { const value = JSON.parse(readStored(SESSION_KEY, 'session') ?? 'null'); return value && /^[a-f0-9]{64}$/.test(value.token) ? value : null; } catch { return null; }
}
export function connectionHeaders(): HeadersInit {
  const session = readConnection();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
}
export async function connectSources(preferences: ConnectionPreferences) {
  // Keys are sent only in the POST body; only an opaque short-lived token is retained.
  const response = await fetch('/api/v1/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preferences) });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'Connection failed');
  const session = await response.json() as ConnectionSession;
  await disconnectSources();
  writeStored(SESSION_KEY, JSON.stringify(session), 'session');
  return session;
}
export async function disconnectSources() {
  const headers = connectionHeaders();
  removeStored(SESSION_KEY, 'session');
  if ('Authorization' in headers) await fetch('/api/v1/connections', { method: 'DELETE', headers }).catch(() => undefined);
}
