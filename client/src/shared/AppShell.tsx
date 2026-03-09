import { MapPage } from '../components/MapPage';
import { useMapRuntime } from '../map/useMapRuntime';

type AppShellProps = {
  role: 'dm' | 'player';
};

export function AppShell({ role }: AppShellProps) {
  useMapRuntime(role, true);
  return <MapPage role={role} />;
}
