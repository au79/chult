import { HexInstruction, HexInstructionPayload } from '#shared/hexes';
import type { Hono } from 'hono';
import { HexStore } from '../hexStore.js';

export function registerHexRoutes(app: Hono, store: HexStore) {
  app.get('/api/hexes', (c) => {
    return c.json({ hexes: store.getAll() });
  });

  app.post('/api/hexes', async (c) => {
    let payload: HexInstructionPayload;
    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const hexId = payload?.value ?? 0;
    if (!Number.isInteger(hexId) || hexId === 0) {
      return c.json(
        { error: 'Payload must include non-zero integer "value"' },
        400,
      );
    }

    try {
      const next = await store.applyHexIdChange(hexId as HexInstruction);
      return c.json({ hexes: next });
    } catch (error) {
      return c.json(
        { error: (error as Error).message ?? 'Failed to apply instruction' },
        500,
      );
    }
  });
}
