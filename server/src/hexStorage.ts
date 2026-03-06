import { constants } from 'node:fs';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface HexStorageAdapter {
  init(): Promise<void>;
  read(): Promise<string>;
  write(contents: string): Promise<void>;
}

export class LocalHexStorage implements HexStorageAdapter {
  readonly #filePath: string;

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  async init() {
    await ensureFile(this.#filePath);
  }

  async read() {
    return readFile(this.#filePath, 'utf8');
  }

  async write(contents: string) {
    const tmpPath = `${this.#filePath}.tmp`;
    await writeFile(tmpPath, contents, 'utf8');
    await rename(tmpPath, this.#filePath);
  }
}

export class S3HexStorage implements HexStorageAdapter {
  readonly #bucketName: string;
  readonly #key: string;
  readonly #client: S3Client;

  constructor(bucketName: string, filePath: string) {
    this.#bucketName = bucketName;
    this.#key = basename(filePath);
    this.#client = new S3Client({});
  }

  async init() {
    return Promise.resolve();
  }

  async read() {
    try {
      const response = await this.#client.send(
        new GetObjectCommand({
          Bucket: this.#bucketName,
          Key: this.#key,
        }),
      );
      if (response.Body && 'transformToString' in response.Body) {
        return await response.Body.transformToString();
      }
      return '';
    } catch (error) {
      if (isMissingS3Object(error)) {
        return '';
      }
      throw error;
    }
  }

  async write(contents: string) {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucketName,
        Key: this.#key,
        Body: contents,
        ContentType: 'text/plain; charset=utf-8',
      }),
    );
  }
}

async function ensureFile(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
  try {
    await access(filePath, constants.F_OK);
  } catch {
    await writeFile(filePath, '', 'utf8');
  }
}

function isMissingS3Object(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  if (name === 'NoSuchKey') return true;
  const statusCode = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode;
  return statusCode === 404;
}
