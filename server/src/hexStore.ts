import { EventEmitter } from 'node:events';
import type {
  HexId,
  HexInstruction,
  RevealedHexes,
} from './types/hexes.js';
import type {
  AtomicHexStorageAdapter,
  HexStorageAdapter,
} from './hexStorage.js';
import { normalizeHexIds } from './hexIds.js';

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
  readonly #storage: HexStorageAdapter;

  constructor(storage: HexStorageAdapter) {
    super();
    this.#storage = storage;
  }

  /**
   * Ensures the backing file exists and warms the in-memory cache.
   */
  async init() {
    await this.#storage.init();
    this.#hexes = await this.getLatest();
  }

  /**
   * Returns the current revealed hex IDs.
   */
  getAll(): HexId[] {
    return [...this.#hexes];
  }

  /**
   * Reads canonical state from storage and refreshes in-memory cache.
   */
  async getLatest(): Promise<HexId[]> {
    this.#hexes = await this.#readFromStorage();
    return this.getAll();
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
      if (isAtomicStorageAdapter(this.#storage)) {
        const nextHexes = await this.#storage.applyHexIdChange(
          value as HexInstruction,
        );
        if (!haveSameHexes(this.#hexes, nextHexes)) {
          this.#hexes = nextHexes;
          this.emit('change', { hexes: this.getAll() } satisfies RevealedHexes);
        }
        return;
      }

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
      await this.#writeToStorage(nextHexes);
    });

    await this.#operationQueue;
    return this.getAll();
  }

  /**
   * Persists the provided list while ensuring sequential writes.
   */
  async #writeToStorage(next: HexId[]) {
    const serialized = next.join(NEWLINE) + (next.length ? NEWLINE : '');
    await this.#storage.write(serialized);
    this.#hexes = next;
    this.emit('change', { hexes: this.getAll() } satisfies RevealedHexes);
  }

  async #readFromStorage(): Promise<HexId[]> {
    try {
      const contents = await this.#storage.read();
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

function isAtomicStorageAdapter(
  storage: HexStorageAdapter,
): storage is AtomicHexStorageAdapter {
  return 'applyHexIdChange' in storage;
}

function haveSameHexes(current: HexId[], next: HexId[]) {
  if (current.length !== next.length) return false;
  return current.every((value, index) => value === next[index]);
}
