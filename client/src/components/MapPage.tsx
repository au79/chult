import { DMControls } from './DMControls';
import { MapViewport } from './MapViewport';

type MapPageProps = {
  role: 'dm' | 'player';
};

export function MapPage({ role }: MapPageProps) {
  return (
    <main className="container" data-role={role}>
      {role === 'dm' ? <DMControls /> : null}
      <MapViewport />
    </main>
  );
}
