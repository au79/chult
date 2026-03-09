// @ts-nocheck
const HEX_TILE_SELECTOR = '.st0';
const RESET_BUTTON_ID = 'reset';
const MENU_TOGGLE_BUTTON_ID = 'menu-toggle';
const MENU_PANEL_ID = 'dm-menu';
const MENU_SHELL_ID = 'dm-menu-shell';
const HEX_OPACITY_SLIDER_ID = 'hex-opacity';
const HEX_OPACITY_VALUE_ID = 'hex-opacity-value';
const RESET_CONFIRM_MODAL_ID = 'reset-confirm-modal';
const RESET_CONFIRM_BUTTON_ID = 'reset-confirm';
const RESET_CANCEL_BUTTON_ID = 'reset-cancel';
const HEX_API_ENDPOINT = '/api/hexes';
const POLL_INTERVAL_MS = 2000;
const MIN_HEX_OPACITY_PERCENT = 10;
const MAX_HEX_OPACITY_PERCENT = 100;
const DEFAULT_DM_HEX_OPACITY_PERCENT = 65;
const DM_HEX_OPACITY_STORAGE_KEY = 'dmHexOpacityPercent';

/**
 * Initializes click/reset handlers for hex tiles and wires them to the service.
 */
export function initHexVisibilityControls(options = {}) {
  const { role = 'player' } = options;
  const isDungeonMaster = role === 'dm';

  registerPassiveTouchListeners(document);

  const hexTiles = Array.from(document.querySelectorAll(HEX_TILE_SELECTOR));
  const resetButton = document.getElementById(RESET_BUTTON_ID);
  const menuToggleButton = document.getElementById(MENU_TOGGLE_BUTTON_ID);
  const menuPanel = document.getElementById(MENU_PANEL_ID);
  const menuShell = document.getElementById(MENU_SHELL_ID);
  const hexOpacitySlider = document.getElementById(HEX_OPACITY_SLIDER_ID);
  const hexOpacityValue = document.getElementById(HEX_OPACITY_VALUE_ID);
  const resetConfirmModal = document.getElementById(RESET_CONFIRM_MODAL_ID);
  const resetConfirmButton = document.getElementById(RESET_CONFIRM_BUTTON_ID);
  const resetCancelButton = document.getElementById(RESET_CANCEL_BUTTON_ID);

  const revealedHexIds = new Set();
  let isFetching = false;
  let isPolling = false;
  const hexLookup = new Map();

  hexTiles.forEach((hexElement, index) => {
    const id = String(index);
    hexElement.dataset.hexId = id;
    hexElement.setAttribute('id', id);
    hexLookup.set(id, hexElement);

    if (isDungeonMaster) {
      hexElement.addEventListener('click', handleHexToggle);
    } else {
      hexElement.style.pointerEvents = 'none';
    }
  });

  if (resetButton) {
    if (isDungeonMaster) {
      resetButton.addEventListener('click', requestResetConfirmation);
    } else {
      resetButton.style.display = 'none';
    }
  }

  if (isDungeonMaster) {
    initDungeonMasterMenu();
    initHexOpacityControl();
    initResetConfirmationModal();
  } else {
    document.documentElement.style.setProperty('--hex-opacity', '1');
  }

  void fetchInitialState();
  startPolling();

  /**
   * Handles a DM click by sending a signed instruction to the service.
   */
  function handleHexToggle(event) {
    const hexElement = event.currentTarget;
    if (!hexElement) return;

    const hexId = hexElement.dataset.hexId;
    if (!hexId) return;

    const shouldCover = hexElement.classList.contains('off');
    const instructionValue = shouldCover ? Number(hexId) : -Number(hexId);
    applyLocalToggle(hexId, !shouldCover);
    void sendHexInstruction(instructionValue);
  }

  /**
   * Sends positive instructions for every revealed hex to re-cover them.
   */
  function requestResetConfirmation(event) {
    event.preventDefault();
    if (!revealedHexIds.size || isFetching) return;
    if (!resetConfirmModal || !resetConfirmButton || !resetCancelButton) {
      void handleReset();
      return;
    }
    resetConfirmModal.classList.add('open');
  }

  async function handleReset() {
    if (!revealedHexIds.size || isFetching) return;
    isFetching = true;
    try {
      for (const hexId of Array.from(revealedHexIds)) {
        await sendHexInstruction(Number(hexId));
      }
    } finally {
      isFetching = false;
    }
  }

  function initResetConfirmationModal() {
    if (!resetConfirmModal || !resetConfirmButton || !resetCancelButton) return;

    resetConfirmButton.addEventListener('click', () => {
      resetConfirmModal.classList.remove('open');
      void handleReset();
    });

    resetCancelButton.addEventListener('click', () => {
      resetConfirmModal.classList.remove('open');
    });

    resetConfirmModal.addEventListener('click', (event) => {
      if (event.target === resetConfirmModal) {
        resetConfirmModal.classList.remove('open');
      }
    });
  }

  function initDungeonMasterMenu() {
    if (!menuToggleButton || !menuPanel || !menuShell) return;

    menuToggleButton.addEventListener('click', () => {
      const isOpen = menuShell.classList.toggle('open');
      menuToggleButton.setAttribute('aria-expanded', String(isOpen));
      menuToggleButton.classList.toggle('open', isOpen);
      menuToggleButton.setAttribute(
        'aria-label',
        isOpen ? 'Close DM controls' : 'Open DM controls',
      );
    });

    document.addEventListener('click', (event) => {
      const clickTarget = event.target;
      if (clickTarget instanceof Node && !menuShell.contains(clickTarget)) {
        menuShell.classList.remove('open');
        menuToggleButton.setAttribute('aria-expanded', 'false');
        menuToggleButton.classList.remove('open');
        menuToggleButton.setAttribute('aria-label', 'Open DM controls');
      }
    });
  }

  function initHexOpacityControl() {
    if (!hexOpacitySlider) return;
    const storedValue = getStoredHexOpacityPercent();
    const startingValue =
      storedValue ||
      Number(hexOpacitySlider.value) ||
      DEFAULT_DM_HEX_OPACITY_PERCENT;
    hexOpacitySlider.value = String(startingValue);
    setHexOpacity(startingValue);

    hexOpacitySlider.addEventListener('input', (event) => {
      const nextValue = Number(event.target?.value);
      setHexOpacity(nextValue);
      persistHexOpacityPercent(nextValue);
    });
  }

  function setHexOpacity(percentValue) {
    const clampedPercent = Math.min(
      MAX_HEX_OPACITY_PERCENT,
      Math.max(
        MIN_HEX_OPACITY_PERCENT,
        Number(percentValue) || MAX_HEX_OPACITY_PERCENT,
      ),
    );
    const normalizedOpacity = (clampedPercent / 100).toFixed(2);
    document.documentElement.style.setProperty(
      '--hex-opacity',
      normalizedOpacity,
    );
    if (hexOpacityValue) {
      hexOpacityValue.textContent = `${clampedPercent}%`;
    }
  }

  function getStoredHexOpacityPercent() {
    try {
      const rawValue = window.localStorage.getItem(DM_HEX_OPACITY_STORAGE_KEY);
      if (!rawValue) return null;
      const parsedValue = Number(rawValue);
      if (Number.isNaN(parsedValue)) return null;
      return Math.min(
        MAX_HEX_OPACITY_PERCENT,
        Math.max(MIN_HEX_OPACITY_PERCENT, parsedValue),
      );
    } catch (error) {
      return null;
    }
  }

  function persistHexOpacityPercent(percentValue) {
    try {
      const safeValue = Math.min(
        MAX_HEX_OPACITY_PERCENT,
        Math.max(
          MIN_HEX_OPACITY_PERCENT,
          Number(percentValue) || MAX_HEX_OPACITY_PERCENT,
        ),
      );
      window.localStorage.setItem(
        DM_HEX_OPACITY_STORAGE_KEY,
        String(safeValue),
      );
    } catch (error) {
      // Ignore storage errors (e.g. privacy mode) and keep the UI responsive.
    }
  }

  /**
   * Fetches the canonical state from the REST endpoint once on load.
   */
  async function fetchInitialState() {
    try {
      const response = await fetch(HEX_API_ENDPOINT);
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }
      const payload = await response.json();
      applyServerState(payload?.hexes || []);
    } catch (error) {
      console.error('Failed to load revealed hexes', error);
    }
  }

  /**
   * Polls the REST endpoint for the latest state.
   */
  function startPolling() {
    setInterval(() => {
      void pollState();
    }, POLL_INTERVAL_MS);
  }

  async function pollState() {
    if (isPolling) return;
    isPolling = true;
    try {
      const response = await fetch(HEX_API_ENDPOINT);
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }
      const payload = await response.json();
      applyServerState(payload?.hexes || []);
    } catch (error) {
      console.error('Failed to poll revealed hexes', error);
    } finally {
      isPolling = false;
    }
  }

  /**
   * Sends the signed instruction to the REST endpoint.
   */
  async function sendHexInstruction(value) {
    try {
      const response = await fetch(HEX_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });

      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to update hex state', error);
    }
  }

  /**
   * Applies the canonical list from the service to the DOM.
   */
  function applyServerState(hexIds) {
    revealedHexIds.clear();
    (hexIds || []).forEach((hexId) => {
      revealedHexIds.add(String(hexId));
    });

    hexLookup.forEach((hexElement, hexId) => {
      if (revealedHexIds.has(hexId)) {
        hexElement.classList.add('off');
      } else {
        hexElement.classList.remove('off');
      }
    });
  }

  /**
   * Optimistically toggles a single hex locally between revealed/covered.
   */
  function applyLocalToggle(hexId, shouldReveal) {
    const target = hexLookup.get(String(hexId));
    if (!target) return;

    if (shouldReveal) {
      revealedHexIds.add(String(hexId));
      target.classList.add('off');
    } else {
      revealedHexIds.delete(String(hexId));
      target.classList.remove('off');
    }
  }
}

/**
 * Adds safe passive touch listeners required by some mobile browsers.
 */
function registerPassiveTouchListeners(target) {
  const passiveEvents = { touchend: createNoopListener() };
  Object.keys(passiveEvents).forEach((eventName) => {
    target.addEventListener(eventName, passiveEvents[eventName]);
  });
}

/**
 * Produces a placeholder listener to satisfy passive event requirements.
 */
function createNoopListener() {
  function noop() {}
  return noop;
}
