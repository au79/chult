import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { HexInstruction } from '#shared/hexes';
import { registerHexRoutes } from '../routes/hexes.js';

class FakeStore {
  hexes: number[] = [1, 2];
  applyHexIdChange = vi.fn(async (_value: HexInstruction<number>) => {
    return this.hexes;
  });
  getAll() {
    return [...this.hexes];
  }
}

describe('hex routes', () => {
  it('returns the revealed hexes list via GET', async () => {
    const store = new FakeStore();
    const app = new Hono();
    registerHexRoutes(app, store as any);

    const response = await app.request('http://test/api/hexes');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ hexes: [1, 2] });
  });

  it('validates POST payloads', async () => {
    const store = new FakeStore();
    const app = new Hono();
    registerHexRoutes(app, store as any);

    const response = await app.request('http://test/api/hexes', {
      method: 'POST',
      body: JSON.stringify({ value: 0 }),
    });

    expect(response.status).toBe(400);
    expect(store.applyHexIdChange).not.toHaveBeenCalled();
  });

  it('applies valid instructions through POST', async () => {
    const store = new FakeStore();
    const app = new Hono();
    registerHexRoutes(app, store as any);

    const response = await app.request('http://test/api/hexes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: -9 }),
    });

    expect(response.status).toBe(200);
    expect(store.applyHexIdChange).toHaveBeenCalledWith(-9);
  });
});
