import { describe, expect, it, vi } from 'vitest';
import {
  BatchWriteItemCommand,
  DeleteItemCommand,
  DescribeTableCommand,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { DynamoDbHexStorage } from '../hexStorage.js';

describe('DynamoDbHexStorage', () => {
  it('verifies table access during init', async () => {
    const send = vi
      .fn()
      .mockImplementationOnce(async (command: any) => {
        expect(command).toBeInstanceOf(DescribeTableCommand);
        expect(command.input.TableName).toBe('hex-table');
        return {};
      })
      .mockImplementationOnce(async (command: any) => {
        expect(command).toBeInstanceOf(QueryCommand);
        expect(command.input.Limit).toBe(1);
        return { Items: [] };
      });
    const storage = new DynamoDbHexStorage(
      'hex-table',
      'campaign-a',
      undefined,
      { send },
    );

    await expect(storage.init()).resolves.toBeUndefined();
  });

  it('throws a clear init error when access check fails', async () => {
    const send = vi
      .fn()
      .mockRejectedValue(new Error('ResourceNotFoundException'));
    const storage = new DynamoDbHexStorage(
      'hex-table',
      'campaign-a',
      undefined,
      { send },
    );

    await expect(storage.init()).rejects.toThrow(
      'Failed to access DynamoDB hex storage table hex-table (mapId=campaign-a): ResourceNotFoundException',
    );
  });

  it('reads and serializes sorted revealed hex IDs', async () => {
    const send = vi
      .fn()
      .mockImplementationOnce(async (command: any) => {
        expect(command).toBeInstanceOf(QueryCommand);
        expect(command.input.ConsistentRead).toBe(true);
        return {
          Items: [
            { mapId: { S: 'campaign-a' }, hexId: { N: '9' } },
            { mapId: { S: 'campaign-a' }, hexId: { N: '2' } },
          ],
          LastEvaluatedKey: { mapId: { S: 'campaign-a' }, hexId: { N: '9' } },
        };
      })
      .mockImplementationOnce(async (command: any) => {
        expect(command.input.ExclusiveStartKey).toEqual({
          mapId: { S: 'campaign-a' },
          hexId: { N: '9' },
        });
        return {
          Items: [{ mapId: { S: 'campaign-a' }, hexId: { N: '3' } }],
        };
      });
    const storage = new DynamoDbHexStorage(
      'hex-table',
      'campaign-a',
      undefined,
      { send },
    );

    await expect(storage.read()).resolves.toBe('2\n3\n9\n');
  });

  it('applies reveal/cover instructions as item put/delete operations', async () => {
    const send = vi
      .fn()
      .mockImplementationOnce(async (command: any) => {
        expect(command).toBeInstanceOf(PutItemCommand);
        expect(command.input.Item).toEqual({
          mapId: { S: 'campaign-a' },
          hexId: { N: '7' },
        });
        return {};
      })
      .mockImplementationOnce(async (command: any) => {
        expect(command).toBeInstanceOf(QueryCommand);
        return {
          Items: [{ mapId: { S: 'campaign-a' }, hexId: { N: '7' } }],
        };
      })
      .mockImplementationOnce(async (command: any) => {
        expect(command).toBeInstanceOf(DeleteItemCommand);
        expect(command.input.Key).toEqual({
          mapId: { S: 'campaign-a' },
          hexId: { N: '7' },
        });
        return {};
      })
      .mockImplementationOnce(async (command: any) => {
        expect(command).toBeInstanceOf(QueryCommand);
        return { Items: [] };
      });
    const storage = new DynamoDbHexStorage(
      'hex-table',
      'campaign-a',
      undefined,
      { send },
    );

    await expect(storage.applyHexIdChange(-7)).resolves.toEqual([7]);
    await expect(storage.applyHexIdChange(7)).resolves.toEqual([]);
  });

  it('writes only the delta between current and next state', async () => {
    const send = vi
      .fn()
      .mockImplementationOnce(async () => {
        return {
          Items: [
            { mapId: { S: 'campaign-a' }, hexId: { N: '1' } },
            { mapId: { S: 'campaign-a' }, hexId: { N: '2' } },
          ],
        };
      })
      .mockImplementationOnce(async (command: any) => {
        expect(command).toBeInstanceOf(BatchWriteItemCommand);
        expect(command.input.RequestItems).toEqual({
          'hex-table': [
            {
              DeleteRequest: {
                Key: {
                  mapId: { S: 'campaign-a' },
                  hexId: { N: '1' },
                },
              },
            },
            {
              PutRequest: {
                Item: {
                  mapId: { S: 'campaign-a' },
                  hexId: { N: '3' },
                },
              },
            },
          ],
        });
        return {};
      });
    const storage = new DynamoDbHexStorage(
      'hex-table',
      'campaign-a',
      undefined,
      { send },
    );

    await storage.write('2\n3\n3\nnot-a-number\n');

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('retries unprocessed batch-write requests', async () => {
    const send = vi
      .fn()
      .mockImplementationOnce(async () => ({ Items: [] }))
      .mockImplementationOnce(async () => ({
        UnprocessedItems: {
          'hex-table': [
            {
              PutRequest: {
                Item: {
                  mapId: { S: 'campaign-a' },
                  hexId: { N: '8' },
                },
              },
            },
          ],
        },
      }))
      .mockImplementationOnce(async () => ({}));
    const storage = new DynamoDbHexStorage(
      'hex-table',
      'campaign-a',
      undefined,
      { send },
    );

    await storage.write('8\n');

    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(BatchWriteItemCommand);
    expect(send.mock.calls[2]?.[0]).toBeInstanceOf(BatchWriteItemCommand);
  });

  it('chunks writes into batches of 25 requests', async () => {
    const send = vi
      .fn()
      .mockImplementationOnce(async () => ({ Items: [] }))
      .mockImplementation(async () => ({}));
    const storage = new DynamoDbHexStorage(
      'hex-table',
      'campaign-a',
      undefined,
      { send },
    );
    const serialized = Array.from(
      { length: 26 },
      (_, index) => `${index + 1}`,
    ).join('\n');

    await storage.write(`${serialized}\n`);

    const batchCalls = send.mock.calls.filter(
      (call) => call[0] instanceof BatchWriteItemCommand,
    );
    expect(batchCalls).toHaveLength(2);
    expect(batchCalls[0]?.[0]?.input?.RequestItems?.['hex-table']?.length).toBe(
      25,
    );
    expect(batchCalls[1]?.[0]?.input?.RequestItems?.['hex-table']?.length).toBe(
      1,
    );
  });
});
