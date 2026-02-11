import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HexStore } from './hexStore.js';
import { LocalHexStorage, S3HexStorage } from './hexStorage.js';
import { registerHexRoutes } from './routes/hexes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = resolve(__dirname, '../../client/public');
const dataFile =
  process.env.DATA_PATH ?? resolve(__dirname, '../data/shown-hexes.txt');

const defaultStorage =
  process.env.HEX_ID_STORAGE ??
  (process.env.AWS_LAMBDA_FUNCTION_NAME ? 's3' : 'local');

export async function createApp() {
  const app = new Hono();
  const storage = resolveHexStorage(defaultStorage, dataFile);
  const hexStore = new HexStore(storage);

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

function resolveHexStorage(storageMode: string, filePath: string) {
  if (storageMode === 'local') {
    return new LocalHexStorage(filePath);
  }
  if (storageMode === 's3') {
    return new S3HexStorage(filePath);
  }
  throw new Error(`Unsupported HEX_ID_STORAGE value: ${storageMode}`);
}
