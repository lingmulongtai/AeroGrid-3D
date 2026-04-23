/**
 * SQLite persistence layer using better-sqlite3.
 * The server remains fully functional if this module fails to load
 * (e.g. native bindings not compiled). See initDb() below.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR  = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'aerogrid.db');

type BetterSQLite3 = typeof import('better-sqlite3');
type DB = InstanceType<BetterSQLite3>;

let db: DB | null = null;

export async function initDb(): Promise<void> {
  try {
    // Dynamic import so the server starts even if better-sqlite3 isn't installed
    const Database = (await import('better-sqlite3')).default as BetterSQLite3;
    fs.mkdirSync(DB_DIR, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    db.exec(`
      CREATE TABLE IF NOT EXISTS flight_snapshots (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        icao24       TEXT    NOT NULL,
        callsign     TEXT,
        country      TEXT,
        latitude     REAL    NOT NULL,
        longitude    REAL    NOT NULL,
        altitude     REAL,
        velocity     REAL,
        heading      REAL,
        vertical_rate REAL,
        on_ground    INTEGER NOT NULL DEFAULT 0,
        captured_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_fs_icao24       ON flight_snapshots(icao24);
      CREATE INDEX IF NOT EXISTS idx_fs_captured_at  ON flight_snapshots(captured_at);

      CREATE TABLE IF NOT EXISTS weather_snapshots (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        radar_tile_url TEXT    NOT NULL,
        captured_at    INTEGER NOT NULL
      );
    `);

    console.log('[db] SQLite initialised at', DB_PATH);
  } catch (err) {
    console.warn('[db] SQLite unavailable — persistence disabled.', (err as Error).message);
    db = null;
  }
}

interface FlightRow {
  id: string;
  callsign: string;
  country: string;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  heading: number;
  verticalRate: number;
  onGround: boolean;
}

export function saveFlightSnapshot(flights: FlightRow[]): void {
  if (!db || flights.length === 0) return;
  const now = Math.floor(Date.now() / 1000);

  const insert = db.prepare(`
    INSERT INTO flight_snapshots
      (icao24, callsign, country, latitude, longitude, altitude, velocity, heading, vertical_rate, on_ground, captured_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((rows: FlightRow[]) => {
    for (const f of rows) {
      insert.run(
        f.id, f.callsign, f.country,
        f.latitude, f.longitude, f.altitude,
        f.velocity, f.heading, f.verticalRate,
        f.onGround ? 1 : 0, now,
      );
    }
  });

  try {
    insertMany(flights);
  } catch (err) {
    console.error('[db] saveFlightSnapshot failed:', err);
  }
}

export function getRecentFlights(icao24: string, limit = 200): unknown[] {
  if (!db) return [];
  return db.prepare(
    'SELECT * FROM flight_snapshots WHERE icao24 = ? ORDER BY captured_at DESC LIMIT ?',
  ).all(icao24, limit);
}

export function pruneOldData(daysToKeep = 7): void {
  if (!db) return;
  const cutoff = Math.floor(Date.now() / 1000) - daysToKeep * 86400;
  const { changes } = db.prepare('DELETE FROM flight_snapshots WHERE captured_at < ?').run(cutoff);
  if (changes > 0) console.log(`[db] Pruned ${changes} old rows`);
}
