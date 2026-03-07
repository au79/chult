import { constants } from 'node:fs';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  BatchWriteItemCommand,
  DeleteItemCommand,
  DescribeTableCommand,
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  type AttributeValue,
  type DynamoDBClientConfig,
  type WriteRequest,
} from '@aws-sdk/client-dynamodb';
import type { HexId, HexInstruction } from '#shared/hexes';
import { normalizeHexIds } from './hexIds.js';

export interface HexStorageAdapter {
  init(): Promise<void>;
  read(): Promise<string>;
  write(contents: string): Promise<void>;
}

export interface AtomicHexStorageAdapter extends HexStorageAdapter {
  applyHexIdChange(value: HexInstruction): Promise<HexId[]>;
}

export class LocalHexStorage implements AtomicHexStorageAdapter {
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

  async applyHexIdChange(value: HexInstruction): Promise<HexId[]> {
    const targetId = Math.abs(value) as HexId;
    const currentSet = new Set(parseHexes(await this.read()));
    const shouldReveal = value < 0;

    let changed = false;
    if (shouldReveal) {
      if (!currentSet.has(targetId)) {
        currentSet.add(targetId);
        changed = true;
      }
    } else if (currentSet.delete(targetId)) {
      changed = true;
    }

    const next = normalizeHexIds([...currentSet]);
    if (changed) {
      await this.write(serializeHexes(next));
    }
    return next;
  }
}

const DDB_MAX_BATCH_SIZE = 25;

type DynamoDbClientLike = Pick<DynamoDBClient, 'send'>;

export class DynamoDbHexStorage implements AtomicHexStorageAdapter {
  readonly #tableName: string;
  readonly #mapId: string;
  readonly #client: DynamoDbClientLike;

  constructor(
    tableName: string,
    mapId: string,
    clientConfig?: DynamoDBClientConfig,
    client?: DynamoDbClientLike,
  ) {
    this.#tableName = tableName;
    this.#mapId = mapId;
    this.#client = client ?? new DynamoDBClient(clientConfig ?? {});
  }

  async init() {
    try {
      await this.#client.send(
        new DescribeTableCommand({
          TableName: this.#tableName,
        }),
      );
      await this.#client.send(
        new QueryCommand({
          TableName: this.#tableName,
          KeyConditionExpression: '#mapId = :mapId',
          ExpressionAttributeNames: {
            '#mapId': 'mapId',
          },
          ExpressionAttributeValues: {
            ':mapId': { S: this.#mapId },
          },
          ConsistentRead: true,
          Limit: 1,
        }),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to access DynamoDB hex storage table ${this.#tableName} (mapId=${this.#mapId}): ${reason}`,
      );
    }
  }

  async read() {
    const hexes = await this.#readHexes();
    return serializeHexes(hexes);
  }

  async write(contents: string) {
    const next = new Set(parseHexes(contents));
    const current = new Set(await this.#readHexes());

    const deleteRequests: WriteRequest[] = [...current]
      .filter((hexId) => !next.has(hexId))
      .map((hexId) => ({
        DeleteRequest: {
          Key: {
            mapId: { S: this.#mapId },
            hexId: { N: String(hexId) },
          },
        },
      }));

    const putRequests: WriteRequest[] = [...next]
      .filter((hexId) => !current.has(hexId))
      .map((hexId) => ({
        PutRequest: {
          Item: {
            mapId: { S: this.#mapId },
            hexId: { N: String(hexId) },
          },
        },
      }));

    const requests: WriteRequest[] = [...deleteRequests, ...putRequests];
    for (let index = 0; index < requests.length; index += DDB_MAX_BATCH_SIZE) {
      let pending: WriteRequest[] = requests.slice(
        index,
        index + DDB_MAX_BATCH_SIZE,
      );
      while (pending.length > 0) {
        const response = await this.#client.send(
          new BatchWriteItemCommand({
            RequestItems: {
              [this.#tableName]: pending,
            },
          }),
        );
        pending = response.UnprocessedItems?.[this.#tableName] ?? [];
      }
    }
  }

  async applyHexIdChange(value: HexInstruction): Promise<HexId[]> {
    const targetId = Math.abs(value) as HexId;
    if (value < 0) {
      await this.#client.send(
        new PutItemCommand({
          TableName: this.#tableName,
          Item: {
            mapId: { S: this.#mapId },
            hexId: { N: String(targetId) },
          },
        }),
      );
    } else {
      await this.#client.send(
        new DeleteItemCommand({
          TableName: this.#tableName,
          Key: {
            mapId: { S: this.#mapId },
            hexId: { N: String(targetId) },
          },
        }),
      );
    }
    return this.#readHexes();
  }

  async #readHexes() {
    const collected: HexId[] = [];
    let lastEvaluatedKey: Record<string, AttributeValue> | undefined;

    do {
      const response = await this.#client.send(
        new QueryCommand({
          TableName: this.#tableName,
          KeyConditionExpression: '#mapId = :mapId',
          ExpressionAttributeNames: {
            '#mapId': 'mapId',
          },
          ExpressionAttributeValues: {
            ':mapId': { S: this.#mapId },
          },
          ConsistentRead: true,
          ExclusiveStartKey: lastEvaluatedKey,
        }),
      );

      for (const item of response.Items ?? []) {
        const rawHexId = item.hexId?.N;
        if (!rawHexId) continue;
        const parsed = Number.parseInt(rawHexId, 10);
        if (Number.isInteger(parsed) && parsed > 0) {
          collected.push(parsed as HexId);
        }
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return normalizeHexIds(collected);
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

function parseHexes(contents: string): HexId[] {
  return normalizeHexIds(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => Number.parseInt(line, 10)),
  );
}

function serializeHexes(hexes: HexId[]) {
  return hexes.join('\n') + (hexes.length ? '\n' : '');
}
