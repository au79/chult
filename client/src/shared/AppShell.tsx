import { MapPage } from '../components/MapPage';
import { useAppUIState } from '../map/useAppUIState';
import { useMapViewport } from '../map/useMapViewport';
import type { MapRole, MapUiState } from '../map/types';

type AppShellProps = {
  role: MapRole;
};

export function AppShell({ role }: AppShellProps) {
  const { viewport, updateViewport } = useMapViewport();
  const mapUiState: MapUiState = {
    role,
    viewport,
  };

  const {
    revealedHexIds,
    toggleHex,
    dmUi: {
      menuOpen,
      resetModalOpen,
      hexOpacityPercent,
      toggleMenu,
      closeMenu,
      requestReset,
      cancelReset,
      confirmReset,
      setHexOpacityPercent,
    },
  } = useAppUIState(role);

  return (
    <MapPage
      role={mapUiState.role}
      revealedHexIds={revealedHexIds}
      hexOpacityPercent={hexOpacityPercent}
      dmMenuOpen={menuOpen}
      resetModalOpen={resetModalOpen}
      onToggleHex={toggleHex}
      onViewportChange={updateViewport}
      onToggleDmMenu={toggleMenu}
      onCloseDmMenu={closeMenu}
      onRequestReset={requestReset}
      onCancelReset={cancelReset}
      onConfirmReset={confirmReset}
      onHexOpacityPercentChange={setHexOpacityPercent}
    />
  );
}
