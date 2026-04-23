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
  next();
});

// ── REST endpoints ─────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', wsClients: getClientCount(), time: new Date().toISOString() });
});

// Historical positions for a specific aircraft (requires SQLite)
app.get('/api/flights/history/:icao24', (req, res) => {
  const rows = getRecentFlights(req.params.icao24, 200);
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
