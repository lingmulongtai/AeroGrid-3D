import express from 'express';
import { createServer } from 'http';
import { initWss, getClientCount } from './ws.js';
import { initDb, getRecentFlights } from './db.js';
import { startFlightFetcher } from './fetchers/flights.js';
import { startWeatherFetcher } from './fetchers/weather.js';

const PORT = Number(process.env.SERVER_PORT ?? 4000);

const app = express();
app.use(express.json());

// Allow cross-origin requests from the Vite dev server
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.options('*', (_req, res) => res.sendStatus(204));

const ICAO24_REGEX = /^[a-f0-9]{6}$/i;
const MAX_HISTORY_LIMIT = 500;

// ── REST endpoints ─────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', wsClients: getClientCount(), time: new Date().toISOString() });
});

// Historical positions for a specific aircraft (requires SQLite)
app.get('/api/flights/history/:icao24', (req, res) => {
  const icao24 = req.params.icao24.trim().toLowerCase();
  if (!ICAO24_REGEX.test(icao24)) {
    res.status(400).json({ error: 'Invalid ICAO24 format. Expected 6 hexadecimal characters.' });
    return;
  }

  const requestedLimit = Number.parseInt(String(req.query.limit ?? ''), 10);
  const safeLimit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(MAX_HISTORY_LIMIT, requestedLimit))
    : 200;

  const rows = getRecentFlights(icao24, safeLimit);
  res.json(rows);
});

// ── Bootstrap ──────────────────────────────────────────────────────────────

const httpServer = createServer(app);
initWss(httpServer);

// DB is optional — server works without it
await initDb();

startFlightFetcher();
startWeatherFetcher();

httpServer.listen(PORT, () => {
  console.log(`\n🚀 AeroGrid server  →  http://localhost:${PORT}`);
  console.log(`   WebSocket        →  ws://localhost:${PORT}/ws`);
  console.log(`   Health check     →  http://localhost:${PORT}/api/health\n`);
});
