import { serve } from '@hono/node-server';
import type { Server as HttpServer } from 'node:http';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 9876;
const app = await createApp();
const server = serve({
  fetch: app.fetch,
  port,
}) as HttpServer;

console.log(`Server listening at http://localhost:${port}`);
