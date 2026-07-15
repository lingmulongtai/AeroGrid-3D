import express, { type Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { AtlasDataService } from './services/atlasData.js';

interface AppOptions {
  dataService: AtlasDataService;
  staticDir?: string;
  logger?: (event: Record<string, unknown>) => void;
}

function parseNumber(value: unknown): number {
  return Number.parseFloat(String(value ?? ''));
}

export function createApp({ dataService, staticDir, logger }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  if (logger) {
    app.use((req, res, next) => {
      const startedAt = performance.now();
      res.on('finish', () => logger({
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        event: 'http.request',
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
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

    const snapshot = await dataService.getFlights({ latitude, longitude, radiusNm });
    res.status(snapshot.status === 'rate-limited' ? 429 : 200).json(snapshot);
  });

  app.get('/api/v1/weather', async (req, res) => {
    const forceRefresh = req.query.refresh === '1';
    const snapshot = await dataService.getWeather(forceRefresh);
    res.json(snapshot);
  });

  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir, { maxAge: '1h', index: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  return app;
}
