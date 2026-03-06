import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { describe, expect, beforeEach, afterEach, it, vi } from 'vitest';
import { HexStore } from '../hexStore.js';
import { LocalHexStorage } from '../hexStorage.js';
import type { HexInstruction } from '#shared/hexes';

describe('HexStore', () => {
  let tempDir: string;
  let filePath: string;
  let store: HexStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'hex-store-'));
    filePath = join(tempDir, 'hexes.txt');
    store = new HexStore(new LocalHexStorage(filePath));
    await store.init();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates the backing file on init', async () => {
    const contents = await readFile(filePath, 'utf8');
    expect(contents).toBe('');
  });

  it('reveals and covers hexes while keeping values sorted and unique', async () => {
    await store.applyHexIdChange(-5);
    await store.applyHexIdChange(-3);
    await store.applyHexIdChange(-5);
    await store.applyHexIdChange(3);

    expect(store.getAll()).toEqual([5]);

    const serialized = await readFile(filePath, 'utf8');
    expect(serialized.trim()).toBe('5');
  });

  it('ignores redundant updates without re-writing the data file', async () => {
    await store.applyHexIdChange(-1);
    const before = await readFile(filePath, 'utf8');
    await store.applyHexIdChange(-1);
    const after = await readFile(filePath, 'utf8');
    expect(after).toBe(before);
  });

  it('emits change events whenever the list mutates', async () => {
    const payloads: number[][] = [];
    store.on('change', (payload) => payloads.push(payload.hexes));

    await store.applyHexIdChange(-2);
    await store.applyHexIdChange(-4);
    await store.applyHexIdChange(2);

    expect(payloads).toEqual([[2], [2, 4], [4]]);
  });

  it('serializes concurrent writes to avoid corruption', async () => {
    await Promise.all([
      store.applyHexIdChange(-10),
      store.applyHexIdChange(-11),
      store.applyHexIdChange(-9),
    ]);

    const raw = await readFile(filePath, 'utf8');
    expect(raw.trim().split('\n')).toEqual(['9', '10', '11']);
  });

  it('uses atomic adapter operations when available', async () => {
    class AtomicStorage {
      read = vi.fn(async () => '3\n');
      write = vi.fn(async () => undefined);
      init = vi.fn(async () => undefined);
      applyHexIdChange = vi.fn(async (value: HexInstruction) => {
        return value < 0 ? [3, Math.abs(value)] : [3];
      });
    }

    const storage = new AtomicStorage();
    const atomicStore = new HexStore(storage as any);
    await atomicStore.init();

    await atomicStore.applyHexIdChange(-9);

    expect(storage.applyHexIdChange).toHaveBeenCalledWith(-9);
    expect(storage.write).not.toHaveBeenCalled();
    expect(atomicStore.getAll()).toEqual([3, 9]);
  });
});
