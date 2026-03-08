import type { HexId } from './types/hexes.js';

/**
 * Returns a deduped, sorted list of positive integers.
 */
export function normalizeHexIds(values: number[]): HexId[] {
  return Array.from(
    new Set(values.filter((value) => Number.isInteger(value) && value > 0)),
  )
    .sort((a, b) => a - b)
    .map((value) => value as HexId);
}
