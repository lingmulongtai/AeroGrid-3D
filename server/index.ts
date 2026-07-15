import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createAtlasDataService } from './services/atlasData.js';

const PORT = Number(process.env.PORT ?? process.env.SERVER_PORT ?? 4000);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = createApp({
  dataService: createAtlasDataService(),
  staticDir: path.join(projectRoot, 'dist'),
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    level: 'info',
    event: 'server.started',
    service: 'aerogrid-3d',
    port: PORT,
    time: new Date().toISOString(),
  }));
});
