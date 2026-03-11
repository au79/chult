import type { MapRole, ViewportState } from '../map/types';
import { DMControls } from './DMControls';
import { MapStage } from './MapStage';

type MapPageProps = {
  role: MapRole;
  revealedHexIds: ReadonlySet<string>;
  hexOpacityPercent: number;
  dmMenuOpen: boolean;
  resetModalOpen: boolean;
  onToggleHex: (hexId: string) => void;
  onViewportChange: (viewport: ViewportState) => void;
  onToggleDmMenu: () => void;
  onCloseDmMenu: () => void;
  onRequestReset: () => void;
  onCancelReset: () => void;
  onConfirmReset: () => void;
  onHexOpacityPercentChange: (nextPercent: number) => void;
};

export function MapPage({
  role,
  revealedHexIds,
  hexOpacityPercent,
  dmMenuOpen,
  resetModalOpen,
  onToggleHex,
  onViewportChange,
  onToggleDmMenu,
  onCloseDmMenu,
  onRequestReset,
  onCancelReset,
  onConfirmReset,
  onHexOpacityPercentChange,
}: MapPageProps) {
  return (
    <main className="container map-page" data-role={role}>
      {role === 'dm' ? (
        <DMControls
          menuOpen={dmMenuOpen}
          resetModalOpen={resetModalOpen}
          hexOpacityPercent={hexOpacityPercent}
          onToggleMenu={onToggleDmMenu}
          onCloseMenu={onCloseDmMenu}
          onRequestReset={onRequestReset}
          onCancelReset={onCancelReset}
          onConfirmReset={onConfirmReset}
          onHexOpacityPercentChange={onHexOpacityPercentChange}
        />
      ) : null}
      <MapStage
        role={role}
        revealedHexIds={revealedHexIds}
        hexOpacityPercent={hexOpacityPercent}
        onToggleHex={onToggleHex}
        onViewportChange={onViewportChange}
      />
    </main>
  );
}
