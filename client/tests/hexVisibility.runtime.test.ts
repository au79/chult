import { describe, expect, it } from 'vitest';
import {
  getInstructionValue,
  toRevealedHexIdSet,
  toggleRevealedHex,
} from '../src/map/runtime/hexVisibilityState';

describe('hexVisibility runtime helpers', () => {
  it('maps server payload to string ids', () => {
    expect(toRevealedHexIdSet([1, '2', 3])).toEqual(new Set(['1', '2', '3']));
  });

  it('uses signed instructions for DM toggle semantics', () => {
    expect(getInstructionValue('7', false)).toBe(-7);
    expect(getInstructionValue('7', true)).toBe(7);
  });

  it('toggles local reveal state', () => {
    expect(toggleRevealedHex(new Set(['1']), '2')).toEqual(new Set(['1', '2']));
    expect(toggleRevealedHex(new Set(['1', '2']), '2')).toEqual(new Set(['1']));
  });
});
