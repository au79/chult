import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const s3SendMock = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    send = s3SendMock;
  }

  class GetObjectCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  class PutObjectCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  return { S3Client, GetObjectCommand, PutObjectCommand };
});

import { LocalHexStorage, S3HexStorage } from '../hexStorage.js';

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

describe('S3HexStorage', () => {
  beforeEach(() => {
    s3SendMock.mockReset();
  });

  it('reads object content when the body supports transformToString', async () => {
    s3SendMock.mockResolvedValue({
      Body: {
        transformToString: vi.fn(async () => '5\n6\n'),
      },
    });
    const storage = new S3HexStorage('bucket-a', '/tmp/shown-hexes.txt');

    await expect(storage.read()).resolves.toBe('5\n6\n');

    expect(s3SendMock).toHaveBeenCalledTimes(1);
    expect(s3SendMock.mock.calls[0]?.[0]?.input).toEqual({
      Bucket: 'bucket-a',
      Key: 'shown-hexes.txt',
    });
  });

  it('returns empty content when object is missing by name', async () => {
    s3SendMock.mockRejectedValue({ name: 'NoSuchKey' });
    const storage = new S3HexStorage('bucket-a', '/tmp/shown-hexes.txt');

    await expect(storage.read()).resolves.toBe('');
  });

  it('returns empty content when object is missing by 404 status', async () => {
    s3SendMock.mockRejectedValue({ $metadata: { httpStatusCode: 404 } });
    const storage = new S3HexStorage('bucket-a', '/tmp/shown-hexes.txt');

    await expect(storage.read()).resolves.toBe('');
  });

  it('rethrows unknown read errors', async () => {
    const error = new Error('boom');
    s3SendMock.mockRejectedValue(error);
    const storage = new S3HexStorage('bucket-a', '/tmp/shown-hexes.txt');

    await expect(storage.read()).rejects.toThrow('boom');
  });

  it('writes object content with expected metadata', async () => {
    s3SendMock.mockResolvedValue({});
    const storage = new S3HexStorage('bucket-a', '/tmp/shown-hexes.txt');

    await storage.write('1\n3\n');

    expect(s3SendMock).toHaveBeenCalledTimes(1);
    expect(s3SendMock.mock.calls[0]?.[0]?.input).toEqual({
      Bucket: 'bucket-a',
      Key: 'shown-hexes.txt',
      Body: '1\n3\n',
      ContentType: 'text/plain; charset=utf-8',
    });
  });
});
