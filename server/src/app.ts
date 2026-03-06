import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HexStore } from './hexStore.js';
import { DynamoDbHexStorage, LocalHexStorage, S3HexStorage } from './hexStorage.js';
import { registerHexRoutes } from './routes/hexes.js';
import { StorageType } from '#shared/hexes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = resolve(__dirname, '../../client/public');
const STORAGE_TYPES = ['local', 's3', 'dynamodb'] as const;
const dataFile =
  process.env.DATA_PATH ?? resolve(__dirname, '../data/shown-hexes.txt');

const defaultStorage: StorageType =
  process.env.AWS_LAMBDA_FUNCTION_NAME ?
    'dynamodb' :
    parseStorageType(process.env.HEX_ID_STORAGE || 'local');

const serviceBucket =
  process.env.SERVICE_BUCKET_NAME ??
  'oolong-chult-map-service';
const hexesTableName = process.env.HEX_DDB_TABLE_NAME ?? 'chult-map-hexes';
const hexesMapId = process.env.HEX_DDB_MAP_ID ?? 'default';

export async function createApp() {
  const app = new Hono();
  const storage = resolveHexStorage(
    defaultStorage,
    dataFile,
    serviceBucket,
    hexesTableName,
    hexesMapId,
  );
  const hexStore = new HexStore(storage);

  logHexStorage(
    defaultStorage,
    dataFile,
    serviceBucket,
    hexesTableName,
    hexesMapId,
  );

  await hexStore.init();

  app.use('*', async (c, next) => {
    const origin = c.req.header('origin');
    const host = c.req.header('host');
    const expectedOrigin = host ? `https://${host}` : null;
    const allowOrigin = origin && expectedOrigin && origin === expectedOrigin;

    if (c.req.method === 'OPTIONS') {
      if (allowOrigin) {
        c.header('Access-Control-Allow-Origin', origin);
        c.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        c.header('Access-Control-Allow-Headers', 'Content-Type');
        c.header('Vary', 'Origin');
      }
      return c.body(null, 204);
    }

    await next();

    if (allowOrigin) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Vary', 'Origin');
    }
  });

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
  storageMode: StorageType,
  filePath: string,
  bucketName: string,
  tableName: string,
  mapId: string,
) {
  if (storageMode === 'local') {
    return new LocalHexStorage(filePath);
  }
  if (storageMode === 's3') {
    return new S3HexStorage(bucketName, filePath);
  }
  if (storageMode === 'dynamodb') {
    return new DynamoDbHexStorage(tableName, mapId);
  }
  throw new Error(`Unsupported HEX_ID_STORAGE value: ${storageMode}`);
}

function parseStorageType(value: string): StorageType {
  if (STORAGE_TYPES.includes(value as StorageType)) {
    return value as StorageType;
  }
  throw new Error(
    `Unsupported HEX_ID_STORAGE value: ${value}. Expected one of: ${STORAGE_TYPES.join(', ')}`,
  );
}

function logHexStorage(
  storageMode: string,
  filePath: string,
  bucketName: string,
  tableName: string,
  mapId: string,
) {
  const runningInLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  const configuredMode = process.env.HEX_ID_STORAGE ?? '(unset)';
  const dataPath = process.env.DATA_PATH ?? '(unset)';
  const configuredBucket = process.env.SERVICE_BUCKET_NAME ?? '(unset)';
  const configuredTableName = process.env.HEX_DDB_TABLE_NAME ?? '(unset)';
  const configuredMapId = process.env.HEX_DDB_MAP_ID ?? '(unset)';
  const storageClass =
    storageMode === 's3'
      ? 'S3HexStorage'
      : storageMode === 'dynamodb'
        ? 'DynamoDbHexStorage'
        : 'LocalHexStorage';

  console.log(
    '[hex-storage] env HEX_ID_STORAGE=%s AWS_LAMBDA_FUNCTION_NAME=%s DATA_PATH=%s SERVICE_BUCKET_NAME=%s HEX_DDB_TABLE_NAME=%s HEX_DDB_MAP_ID=%s',
    configuredMode,
    process.env.AWS_LAMBDA_FUNCTION_NAME ?? '(unset)',
    dataPath,
    configuredBucket,
    configuredTableName,
    configuredMapId,
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
  if (storageMode === 'dynamodb') {
    console.log(
      '[hex-storage] resolved dynamodb table=%s mapId=%s',
      tableName,
      mapId,
    );
  }
}
