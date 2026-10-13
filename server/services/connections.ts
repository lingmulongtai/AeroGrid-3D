import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import type { DataSnapshot } from '../../shared/contracts.js';
import type { ConnectionPreferences, ShipRecord } from '../../shared/live.js';
import { AirplanesLiveProvider } from '../providers/airplanesLive.js';
import { createAtlasDataService, type AtlasDataService, type FlightQuery } from './atlasData.js';
import { DailyQuota } from '../lib/quota.js';

const SESSION_MS = 60 * 60_000;
interface Connection {
  preferences: ConnectionPreferences;
  expiresAt: number;
  flights: AtlasDataService;
  ships: Map<string, ShipRecord>;
  socket?: WebSocket;
  area?: string;
  message?: string;
  connected: boolean;
  privateProvider?: AirplanesLiveProvider;
}
export class Connections {
  private sessions = new Map<string, Connection>();
  private readonly paidQuota = new DailyQuota(450);
  private readonly legacyFlights = createAtlasDataService({ flightProvider: new AirplanesLiveProvider(), flightSource: 'airplanes.live' });
  constructor(private readonly freeFlights: AtlasDataService = createAtlasDataService()) {}
  create(preferences: ConnectionPreferences) {
    this.sweep();
    if (this.sessions.size >= 20) throw new Error('Connection limit reached; disconnect an existing session');
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + SESSION_MS;
    const privateProvider = preferences.flightSource === 'adsbexchange' ? new AirplanesLiveProvider(fetch, Date.now, undefined, { source: 'adsbexchange', apiKey: preferences.rapidApiKey }) : undefined;
    const flights = privateProvider ? createAtlasDataService({ flightProvider: privateProvider, flightSource: 'adsbexchange', quota: this.paidQuota }) : preferences.flightSource === 'airplanes.live' ? this.legacyFlights : this.freeFlights;
    this.sessions.set(token, { preferences, expiresAt, flights, privateProvider, ships: new Map(), connected: false });
    const timer = setTimeout(() => this.remove(token), SESSION_MS);
    timer.unref();
    return { token, expiresAt: new Date(expiresAt).toISOString(), flightSource: preferences.flightSource, shipSource: preferences.shipSource };
  }
  get(token: string) { this.sweep(); return this.sessions.get(token); }
  remove(token: string) {
    const session = this.sessions.get(token);
    session?.socket?.close(); session?.privateProvider?.dispose();
    if (session) { session.preferences.rapidApiKey = undefined; session.preferences.aisStreamKey = undefined; }
    this.sessions.delete(token);
  }
  close() { for (const token of this.sessions.keys()) this.remove(token); }
  private sweep() { for (const [token, session] of this.sessions) if (session.expiresAt <= Date.now()) this.remove(token); }
  ships(session: Connection, query: FlightQuery): DataSnapshot<ShipRecord> {
    const boxKey = `${query.latitude.toFixed(2)}:${query.longitude.toFixed(2)}:${query.radiusNm}`;
    if (!session.socket && !session.message) {
      const socket = new WebSocket('wss://stream.aisstream.io/v0/stream', { perMessageDeflate: true, handshakeTimeout: 10_000 });
      session.socket = socket;
      socket.on('open', () => {
        if (session.socket !== socket) return socket.close();
        session.connected = true;
        this.subscribe(session, query, boxKey);
      });
      socket.on('error', () => { session.message = 'AISStream connection failed; check the key and reconnect in settings'; session.connected = false; });
      socket.on('close', () => { session.connected = false; session.message ??= 'AISStream disconnected; reconnect in settings'; });
      socket.on('message', (buffer) => {
        const raw = buffer.toString();
        if (raw.length > 1_000_000) return;
        try {
          const payload = JSON.parse(raw);
          if (payload.error || payload.Error) { session.message = 'AISStream rejected the subscription; check the key'; socket.close(); return; }
          const p = payload.Message?.PositionReport;
          const meta = payload.MetaData;
          if (!p || !meta || !Number.isFinite(p.Latitude) || !Number.isFinite(p.Longitude) || Math.abs(p.Latitude) > 90 || Math.abs(p.Longitude) > 180) return;
          const id = String(meta.MMSI ?? p.UserID);
          if (!/^\d{9}$/.test(id)) return;
          const receivedMs = Date.parse(meta.time_utc);
          if (!Number.isFinite(receivedMs) || Math.abs(Date.now() - receivedMs) > 5 * 60_000) return;
          if (session.ships.size >= 3000) session.ships.delete(session.ships.keys().next().value!);
          session.ships.set(id, { id, name: String(meta.ShipName ?? `MMSI ${id}`).trim(), latitude: p.Latitude, longitude: p.Longitude, heading: p.TrueHeading < 360 ? p.TrueHeading : p.Cog < 360 ? p.Cog : 0, speedKnots: p.Sog < 102.3 ? p.Sog : 0, receivedAt: new Date(receivedMs).toISOString(), source: 'aisstream' });
        } catch { /* Invalid upstream messages are ignored without logging keys. */ }
      });
    } else if (session.connected && session.area !== boxKey) this.subscribe(session, query, boxKey);
    for (const [id, ship] of session.ships) if (Date.now() - Date.parse(ship.receivedAt) > 5 * 60_000) session.ships.delete(id);
    return { mode: 'live-beta', source: 'aisstream', status: session.connected ? 'available' : 'unavailable', generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30_000).toISOString(), coverage: { kind: 'radius', center: { latitude: query.latitude, longitude: query.longitude }, radiusNm: query.radiusNm }, items: [...session.ships.values()], message: session.message ?? 'Live AIS broadcasts within the requested region; coverage depends on receivers' };
  }
  private subscribe(session: Connection, query: FlightQuery, area: string) {
    const radiusDegrees = query.radiusNm * 1.852 / 111.2;
    const lonDegrees = Math.min(180, radiusDegrees / Math.max(0.1, Math.cos(query.latitude * Math.PI / 180)));
    const south = Math.max(-90, query.latitude - radiusDegrees), north = Math.min(90, query.latitude + radiusDegrees);
    const west = query.longitude - lonDegrees, east = query.longitude + lonDegrees;
    const boxes = west < -180 ? [[[south, west + 360], [north, 180]], [[south, -180], [north, east]]]
      : east > 180 ? [[[south, west], [north, 180]], [[south, -180], [north, east - 360]]]
        : [[[south, west], [north, east]]];
    session.ships.clear();
    session.area = area;
    session.socket?.send(JSON.stringify({ APIKey: session.preferences.aisStreamKey, BoundingBoxes: boxes, FilterMessageTypes: ['PositionReport'] }));
  }
}
export function validatePreferences(body: any): ConnectionPreferences | null {
  if (!body || !['adsb.lol', 'airplanes.live', 'adsbexchange'].includes(body.flightSource) || !['fintraffic', 'aisstream'].includes(body.shipSource)) return null;
  for (const key of ['rapidApiKey', 'aisStreamKey']) if (body[key] !== undefined && (typeof body[key] !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(body[key]))) return null;
  if (body.flightSource === 'adsbexchange' && !body.rapidApiKey || body.shipSource === 'aisstream' && !body.aisStreamKey) return null;
  return { flightSource: body.flightSource, shipSource: body.shipSource, ...(body.flightSource === 'adsbexchange' ? { rapidApiKey: body.rapidApiKey } : {}), ...(body.shipSource === 'aisstream' ? { aisStreamKey: body.aisStreamKey } : {}) };
}
