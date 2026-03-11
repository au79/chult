import { useState } from 'react';
import { MapPage } from '../components/MapPage';
import { useAppUIState } from '../map/useAppUIState';
import { useMapViewport } from '../map/useMapViewport';
import type { FitMapRequest, MapRole, MapUiState } from '../map/types';

type AppShellProps = {
  role: MapRole;
};

const FIT_REQUEST_ID_CYCLE_SIZE = 10;

export function AppShell({ role }: AppShellProps) {
  const { viewport, updateViewport } = useMapViewport();
  const [fitMapRequest, setFitMapRequest] = useState<FitMapRequest>(null);
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

  const requestFitMap = (mode: NonNullable<FitMapRequest>['mode']) => {
    setFitMapRequest((previous) => ({
      mode,
      // Keep each request unique so repeated clicks on the same action re-run fit.
      requestId: ((previous?.requestId ?? 0) + 1) % FIT_REQUEST_ID_CYCLE_SIZE,
    }));
  };

  return (
    <MapPage
      role={mapUiState.role}
      revealedHexIds={revealedHexIds}
      fitMapRequest={fitMapRequest}
      hexOpacityPercent={hexOpacityPercent}
      dmMenuOpen={menuOpen}
      resetModalOpen={resetModalOpen}
      onToggleHex={toggleHex}
      onViewportChange={updateViewport}
      onToggleDmMenu={toggleMenu}
      onCloseDmMenu={closeMenu}
      onRequestReset={requestReset}
      onRequestFitToWindow={() => requestFitMap('window')}
      onRequestFitToWidth={() => requestFitMap('width')}
      onCancelReset={cancelReset}
      onConfirmReset={confirmReset}
      onHexOpacityPercentChange={setHexOpacityPercent}
    />
  );
}
