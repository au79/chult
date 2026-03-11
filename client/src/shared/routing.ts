import type { MapRole } from '../map/types';

export function resolveRoleFromPath(pathname: string): MapRole {
  return pathname.endsWith('/dm.html') ? 'dm' : 'player';
}
