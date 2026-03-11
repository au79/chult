import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getInstructionValue,
  toRevealedHexIdSet,
  toggleRevealedHex,
} from './runtime/hexVisibilityState';
import type { MapRole } from './types';

const HEX_API_ENDPOINT = '/api/hexes';
const POLL_INTERVAL_MS = 2000;
const MIN_HEX_OPACITY_PERCENT = 10;
const MAX_HEX_OPACITY_PERCENT = 100;
const DEFAULT_DM_HEX_OPACITY_PERCENT = 65;
const DM_HEX_OPACITY_STORAGE_KEY = 'dmHexOpacityPercent';

type HexApiPayload = {
  hexes?: Array<number | string>;
};

type FetchLike = typeof fetch;

type SharedAppUiState = {
  revealedHexIds: ReadonlySet<string>;
  toggleHex: (hexId: string) => void;
};

type DungeonMasterUiState = {
  menuOpen: boolean;
  resetModalOpen: boolean;
  hexOpacityPercent: number;
  toggleMenu: () => void;
  closeMenu: () => void;
  requestReset: () => void;
  cancelReset: () => void;
  confirmReset: () => Promise<void>;
  setHexOpacityPercent: (nextPercent: number) => void;
};

type UseAppUiStateResult = SharedAppUiState & {
  dmUi: DungeonMasterUiState;
};

export function useAppUIState(role: MapRole): UseAppUiStateResult {
  // Shared map state used by both DM and player views.
  const [revealedHexIds, setRevealedHexIds] = useState<Set<string>>(new Set());
  // DM-specific UI state stays local here so role-based behavior is centralized.
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [hexOpacityPercent, setHexOpacityPercentState] = useState<number>(
    role === 'dm' ? loadStoredHexOpacityPercent() : MAX_HEX_OPACITY_PERCENT,
  );
  const isPollingRef = useRef(false);

  const applyServerState = useCallback((payload: HexApiPayload) => {
    setRevealedHexIds(toRevealedHexIdSet(payload.hexes));
  }, []);

  const fetchState = useCallback(
    async (fetchImpl: FetchLike = fetch) => {
      const response = await fetchImpl(HEX_API_ENDPOINT);
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }
      const payload = (await response.json()) as HexApiPayload;
      applyServerState(payload);
    },
    [applyServerState],
  );

  const postInstruction = useCallback(async (value: number) => {
    const response = await fetch(HEX_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });

    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }
  }, []);

  useEffect(() => {
    // Non-DM routes should never carry DM controls/opacity state.
    if (role !== 'dm') {
      setMenuOpen(false);
      setResetModalOpen(false);
      setHexOpacityPercentState(MAX_HEX_OPACITY_PERCENT);
      return;
    }

    setHexOpacityPercentState(loadStoredHexOpacityPercent());
  }, [role]);

  useEffect(() => {
    // Polling is shared: both roles read canonical reveal state from the API.
    void fetchState().catch((error) => {
      console.error('Failed to load revealed hexes', error);
    });

    const intervalId = window.setInterval(() => {
      if (isPollingRef.current) {
        return;
      }

      isPollingRef.current = true;
      void fetchState()
        .catch((error) => {
          console.error('Failed to poll revealed hexes', error);
        })
        .finally(() => {
          isPollingRef.current = false;
        });
    }, POLL_INTERVAL_MS);

    // Cancel the periodic fetch once the using component is unloaded from the DOM.
    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchState]);

  const toggleHex = useCallback(
    (hexId: string) => {
      // Mutations are DM-only; player remains read-only.
      if (role !== 'dm') {
        return;
      }

      const isRevealed = revealedHexIds.has(hexId);
      const instruction = getInstructionValue(hexId, isRevealed);

      // Optimistic local flip, then send signed instruction to server.
      setRevealedHexIds((previous) => toggleRevealedHex(previous, hexId));

      void postInstruction(instruction).catch((error) => {
        console.error('Failed to update hex state', error);
      });
    },
    [postInstruction, revealedHexIds, role],
  );

  const requestReset = useCallback(() => {
    if (role !== 'dm' || revealedHexIds.size === 0) {
      return;
    }
    setResetModalOpen(true);
  }, [revealedHexIds.size, role]);

  const cancelReset = useCallback(() => {
    setResetModalOpen(false);
  }, []);

  const confirmReset = useCallback(async () => {
    if (role !== 'dm' || revealedHexIds.size === 0) {
      return;
    }

    setResetModalOpen(false);

    for (const hexId of Array.from(revealedHexIds)) {
      try {
        await postInstruction(Number(hexId));
      } catch (error) {
        console.error('Failed to reset hex state', error);
      }
    }

    setRevealedHexIds(new Set());
  }, [postInstruction, revealedHexIds, role]);

  const setHexOpacityPercent = useCallback(
    (nextPercent: number) => {
      if (role !== 'dm') {
        return;
      }

      const safeValue = clampPercent(nextPercent);
      setHexOpacityPercentState(safeValue);
      persistHexOpacityPercent(safeValue);
    },
    [role],
  );

  const dmUi = useMemo(
    () => ({
      menuOpen,
      resetModalOpen,
      hexOpacityPercent,
      toggleMenu: () => setMenuOpen((previous) => !previous),
      closeMenu: () => setMenuOpen(false),
      requestReset,
      cancelReset,
      confirmReset,
      setHexOpacityPercent,
    }),
    [
      menuOpen,
      resetModalOpen,
      hexOpacityPercent,
      requestReset,
      cancelReset,
      confirmReset,
      setHexOpacityPercent,
    ],
  );

  return {
    revealedHexIds,
    toggleHex,
    dmUi,
  };
}

function loadStoredHexOpacityPercent() {
  try {
    const rawValue = window.localStorage.getItem(DM_HEX_OPACITY_STORAGE_KEY);
    if (!rawValue) {
      return DEFAULT_DM_HEX_OPACITY_PERCENT;
    }

    return clampPercent(Number(rawValue));
  } catch {
    return DEFAULT_DM_HEX_OPACITY_PERCENT;
  }
}

function persistHexOpacityPercent(nextPercent: number) {
  try {
    window.localStorage.setItem(
      DM_HEX_OPACITY_STORAGE_KEY,
      String(clampPercent(nextPercent)),
    );
  } catch {
    // Ignore storage failures.
  }
}

function clampPercent(value: number) {
  return Math.min(
    MAX_HEX_OPACITY_PERCENT,
    Math.max(MIN_HEX_OPACITY_PERCENT, value),
  );
}
