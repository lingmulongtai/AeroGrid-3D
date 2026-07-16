import path from 'node:path';
import { createApp } from './app.js';
import { createAtlasDataService } from './services/atlasData.js';
import { APP_VERSION } from '../shared/contracts.js';

const PORT = Number(process.env.PORT ?? process.env.SERVER_PORT ?? 4000);
const REVISION = process.env.K_REVISION ?? process.env.GITHUB_SHA ?? 'local';
const projectRoot = process.cwd();
const app = createApp({
  dataService: createAtlasDataService({ revision: REVISION }),
  staticDir: path.join(projectRoot, 'dist'),
  logger: (event) => console.log(JSON.stringify({ service: 'aerogrid-3d', version: APP_VERSION, revision: REVISION, time: new Date().toISOString(), ...event })),
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    level: 'info',
    event: 'server.started',
    service: 'aerogrid-3d',
    version: APP_VERSION,
    revision: REVISION,
    port: PORT,
    time: new Date().toISOString(),
  }));
});

function shutdown(signal: string) {
  console.log(JSON.stringify({ level: 'info', event: 'server.stopping', service: 'aerogrid-3d', version: APP_VERSION, revision: REVISION, signal, time: new Date().toISOString() }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
