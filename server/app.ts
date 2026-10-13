import express, { type Express } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AtlasDataService } from './services/atlasData.js';
import { PublicLayers } from './services/publicLayers.js';
import { Connections, validatePreferences } from './services/connections.js';

interface AppOptions {
  dataService: AtlasDataService;
  staticDir?: string;
  logger?: (event: Record<string, unknown>) => void;
  publicLayers?: PublicLayers;
  connections?: Connections;
}

function parseNumber(value: unknown): number {
  return Number.parseFloat(String(value ?? ''));
}

export function createApp({ dataService, staticDir, logger, publicLayers = new PublicLayers(), connections = new Connections(dataService) }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self' https:",
      "font-src 'self' data:",
      "form-action 'none'",
      "frame-ancestors 'none'",
      "frame-src https://www.youtube-nocookie.com",
      "img-src 'self' data: blob: https:",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "worker-src 'self'",
    ].join('; '));
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  if (logger) {
    app.use((req, res, next) => {
      const startedAt = performance.now();
      const requestId = randomUUID();
      res.setHeader('X-Request-Id', requestId);
      res.on('finish', () => logger({
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        event: 'http.request',
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
        requestId,
      }));
      next();
    });
  }
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/v1/status', (_req, res) => {
    res.json(dataService.getStatus());
  });

  const connectionToken = (req: express.Request) => req.headers.authorization?.replace(/^Bearer /, '') ?? '';
  app.post('/api/v1/connections', (req, res) => {
    const origin = req.headers.origin;
    if (origin) {
      try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ message: 'Same-origin requests only' }); }
      catch { return res.status(403).json({ message: 'Invalid origin' }); }
    }
    const preferences = validatePreferences(req.body);
    if (!preferences) return res.status(400).json({ message: 'Select supported sources and provide the required API keys' });
    try { res.json(connections.create(preferences)); } catch { res.status(429).json({ message: 'Connection limit reached; disconnect an existing session' }); }
  });
  app.delete('/api/v1/connections', (req, res) => { connections.remove(connectionToken(req)); res.sendStatus(204); });

  app.get('/api/v1/flights', async (req, res) => {
    const latitude = parseNumber(req.query.lat);
    const longitude = parseNumber(req.query.lon);
    const radiusNm = parseNumber(req.query.radius_nm);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      res.status(400).json({ code: 'INVALID_LATITUDE', message: 'lat must be between -90 and 90' });
      return;
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      res.status(400).json({ code: 'INVALID_LONGITUDE', message: 'lon must be between -180 and 180' });
      return;
    }
    if (!Number.isFinite(radiusNm) || radiusNm < 1 || radiusNm > 250) {
      res.status(400).json({ code: 'INVALID_RADIUS', message: 'radius_nm must be between 1 and 250' });
      return;
    }

    const token = connectionToken(req);
    const session = token ? connections.get(token) : undefined;
    if (token && !session) return res.status(401).json({ message: 'Connection expired; reconnect in settings' });
    const snapshot = await (session?.flights ?? dataService).getFlights({ latitude, longitude, radiusNm });
    res.status(snapshot.status === 'rate-limited' ? 429 : 200).json(snapshot);
  });

  app.get('/api/v1/weather', async (req, res) => {
    const forceRefresh = req.query.refresh === '1';
    const snapshot = await dataService.getWeather(forceRefresh);
    res.json(snapshot);
  });

  const area = (req: express.Request) => {
    const latitude = parseNumber(req.query.lat), longitude = parseNumber(req.query.lon), radiusNm = parseNumber(req.query.radius_nm);
    return Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180 && Number.isFinite(radiusNm) && radiusNm >= 1 && radiusNm <= 250 ? { latitude, longitude, radiusNm } : null;
  };
  app.get('/api/v1/clouds', async (req, res) => {
    const query = area(req);
    if (!query) return res.status(400).json({ message: 'Valid lat, lon and radius_nm (1–250) required' });
    res.json(await publicLayers.clouds(query));
  });
  app.get('/api/v1/satellites', (_req, res, next) => { void publicLayers.orbits.getSnapshot().then((snapshot) => res.json(snapshot)).catch(next); });
  app.get('/api/v1/cameras', async (_req, res) => { res.json(await publicLayers.cameras()); });
  app.get('/api/v1/ships', async (req, res) => {
    const query = area(req);
    if (!query) return res.status(400).json({ message: 'Valid lat, lon and radius_nm (1–250) required' });
    const token = connectionToken(req);
    const session = token ? connections.get(token) : undefined;
    if (token && !session) return res.status(401).json({ message: 'Connection expired; reconnect in settings' });
    res.json(session?.preferences.shipSource === 'aisstream' ? connections.ships(session, query) : await publicLayers.ships());
  });

  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir, {
      index: false,
      setHeaders: (res, filePath) => {
        const isHashedAsset = filePath.includes(`${path.sep}assets${path.sep}`);
        res.setHeader('Cache-Control', isHashedAsset
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600');
      },
    }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  return app;
}
