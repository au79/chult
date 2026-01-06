import { EventEmitter } from 'node:events';
import { constants } from 'node:fs';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { HexId, HexInstruction, RevealedHexes } from '#shared/hexes';

const NEWLINE = '\n';

/**
 * Simple file-backed repository for revealed hex IDs.
 *
 * - Persists positive integers (one per line) in sorted order.
 * - Applies write operations sequentially to avoid clobbering updates.
 * - Emits a "change" event whenever the list mutates.
 */
export class HexStore extends EventEmitter {
  #hexes: HexId[] = [];
  #operationQueue: Promise<void> = Promise.resolve();
  readonly #filePath: string;

  constructor(filePath: string) {
    super();
    this.#filePath = filePath;
  }

  /**
   * Ensures the backing file exists and warms the in-memory cache.
   */
  async init() {
    await ensureFile(this.#filePath);
    this.#hexes = await this.#readFromDisk();
  }

  /**
   * Returns the current revealed hex IDs.
   */
  getAll(): HexId[] {
    return [...this.#hexes];
  }

  /**
   * Applies a signed instruction. Negative numbers reveal, positive numbers cover.
   */
  async applyHexIdChange<T extends number>(
    value: HexInstruction<T>,
  ): Promise<HexId[]> {
    if (!Number.isInteger(value) || value === 0) {
      throw new Error('Hex changes must be non-zero integers');
    }

    this.#operationQueue = this.#operationQueue.then(async () => {
      const targetId = Math.abs(value) as HexId;
      const shouldReveal = value < 0;

      const currentSet = new Set(this.#hexes);
      let changed = false;

      if (shouldReveal) {
        if (!currentSet.has(targetId)) {
          currentSet.add(targetId);
          changed = true;
        }
      } else if (currentSet.delete(targetId)) {
        changed = true;
      }

      if (!changed) {
        return;
      }

      const nextHexes = normalizeHexIds([...currentSet.values()]);
      await this.#writeToDisk(nextHexes);
    });

    await this.#operationQueue;
    return this.getAll();
  }

  /**
   * Persists the provided list while ensuring sequential writes.
   */
  async #writeToDisk(next: HexId[]) {
    const tmpPath = `${this.#filePath}.tmp`;
    const serialized = next.join(NEWLINE) + (next.length ? NEWLINE : '');
    await writeFile(tmpPath, serialized, 'utf8');
    await rename(tmpPath, this.#filePath);
    this.#hexes = next;
    this.emit('change', { hexes: this.getAll() } satisfies RevealedHexes);
  }

  async #readFromDisk(): Promise<HexId[]> {
    try {
      const contents = await readFile(this.#filePath, 'utf8');
      return normalizeHexIds(
        contents
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => Number.parseInt(line, 10))
          .filter((value) => Number.isInteger(value) && value > 0),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}

/**
 * Ensures the data file exists.
 */
async function ensureFile(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
  try {
    await access(filePath, constants.F_OK);
  } catch {
    await writeFile(filePath, '', 'utf8');
  }
}

/**
 * Returns a deduped, sorted list of positive integers.
 */
function normalizeHexIds(values: number[]): HexId[] {
  return Array.from(
    new Set(values.filter((value) => Number.isInteger(value) && value > 0)),
  )
    .sort((a, b) => a - b)
    .map((value) => value as HexId);
}
