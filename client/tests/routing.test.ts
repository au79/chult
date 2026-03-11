import { describe, expect, it } from 'vitest';
import { resolveRoleFromPath } from '../src/shared/routing';

describe('resolveRoleFromPath', () => {
  it('resolves player route for root', () => {
    expect(resolveRoleFromPath('/')).toBe('player');
  });

  it('resolves dm route for dm path', () => {
    expect(resolveRoleFromPath('/dm.html')).toBe('dm');
    expect(resolveRoleFromPath('/foo/dm.html')).toBe('dm');
  });
});
