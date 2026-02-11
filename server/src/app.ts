import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { basename, dirname, resolve } from 'node:path';
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
const serviceBucket =
  process.env.SERVICE_BUCKET_NAME ??
  'oolong-chult-map-service';

export async function createApp() {
  const app = new Hono();
  const storage = resolveHexStorage(defaultStorage, dataFile, serviceBucket);
  const hexStore = new HexStore(storage);

  logHexStorage(defaultStorage, dataFile, serviceBucket);

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

function resolveHexStorage(
  storageMode: string,
  filePath: string,
  bucketName: string,
) {
  if (storageMode === 'local') {
    return new LocalHexStorage(filePath);
  }
  if (storageMode === 's3') {
    return new S3HexStorage(bucketName, filePath);
  }
  throw new Error(`Unsupported HEX_ID_STORAGE value: ${storageMode}`);
}

function logHexStorage(
  storageMode: string,
  filePath: string,
  bucketName: string,
) {
  const runningInLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  const configuredMode = process.env.HEX_ID_STORAGE ?? '(unset)';
  const dataPath = process.env.DATA_PATH ?? '(unset)';
  const configuredBucket = process.env.SERVICE_BUCKET_NAME ?? '(unset)';
  const storageClass = storageMode === 's3' ? 'S3HexStorage' : 'LocalHexStorage';

  console.log(
    '[hex-storage] env HEX_ID_STORAGE=%s AWS_LAMBDA_FUNCTION_NAME=%s DATA_PATH=%s SERVICE_BUCKET_NAME=%s',
    configuredMode,
    process.env.AWS_LAMBDA_FUNCTION_NAME ?? '(unset)',
    dataPath,
    configuredBucket,
  );
  console.log(
    '[hex-storage] resolved mode=%s class=%s lambda=%s dataFile=%s',
    storageMode,
    storageClass,
    runningInLambda,
    filePath,
  );
  if (storageMode === 's3') {
    console.log(
      '[hex-storage] resolved s3 bucket=%s key=%s',
      bucketName,
      basename(filePath),
    );
  }
}
