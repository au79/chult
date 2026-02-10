import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HexStore } from './hexStore.js';
import { registerHexRoutes } from './routes/hexes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = resolve(__dirname, '../../client/public');
const dataFile =
  process.env.DATA_PATH ?? resolve(__dirname, '../data/shown-hexes.txt');

export async function createApp() {
  const app = new Hono();
  const hexStore = new HexStore(dataFile);

  await hexStore.init();

  app.get('/health', (c) => c.json({ status: 'ok' }));
  registerHexRoutes(app, hexStore);

  app.use(
    '*',
    serveStatic({
      root: publicDir,
      rewriteRequestPath: (path) => {
        if (path === '/') return '/player.html';
        return path;
      },
    }),
  );

  return app;
}
