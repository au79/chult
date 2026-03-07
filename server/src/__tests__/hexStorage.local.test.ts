import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalHexStorage } from '../hexStorage.js';

describe('LocalHexStorage', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'hex-storage-local-'));
    filePath = join(tempDir, 'hexes.txt');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates the backing file when initialized', async () => {
    const storage = new LocalHexStorage(filePath);

    await storage.init();

    await expect(readFile(filePath, 'utf8')).resolves.toBe('');
  });

  it('writes and reads serialized contents', async () => {
    const storage = new LocalHexStorage(filePath);
    await storage.init();

    await storage.write('2\n9\n');

    await expect(storage.read()).resolves.toBe('2\n9\n');
  });

  it('supports replacing previous contents atomically', async () => {
    const storage = new LocalHexStorage(filePath);
    await storage.init();
    await storage.write('1\n2\n3\n');

    await storage.write('4\n');

    await expect(storage.read()).resolves.toBe('4\n');
  });

  it('applies atomic reveal and cover operations', async () => {
    const storage = new LocalHexStorage(filePath);
    await storage.init();

    await expect(storage.applyHexIdChange(-9)).resolves.toEqual([9]);
    await expect(storage.applyHexIdChange(-9)).resolves.toEqual([9]);
    await expect(storage.applyHexIdChange(9)).resolves.toEqual([]);
    await expect(storage.read()).resolves.toBe('');
  });
});
