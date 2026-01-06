import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { Server as HttpServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HexStore } from './hexStore.js';
import { registerHexRoutes } from './routes/hexes.js';
import { HexWebSocketHub } from './ws.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = resolve(__dirname, '../../client/public');
const dataFile = resolve(__dirname, '../data/shown-hexes.txt');

const app = new Hono();
const hexStore = new HexStore(dataFile);
const wsHub = new HexWebSocketHub(hexStore);

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

const port = Number(process.env.PORT) || 9876;
const server = serve({
  fetch: app.fetch,
  port,
}) as HttpServer;

wsHub.attach(server);

console.log(`Server listening at http://localhost:${port}`);
