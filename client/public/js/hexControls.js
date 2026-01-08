const HEX_TILE_SELECTOR = ".st0";
const RESET_BUTTON_ID = "reset";
const HEX_API_ENDPOINT = "/api/hexes";
const WS_ENDPOINT = "/ws";

/**
 * Initializes click/reset handlers for hex tiles and wires them to the service.
 */
export function initHexVisibilityControls(options = {}) {
  const { role = "player" } = options;
  const isDungeonMaster = role === "dm";

  registerPassiveTouchListeners(document);

  const hexTiles = Array.from(document.querySelectorAll(HEX_TILE_SELECTOR));
  const resetButton = document.getElementById(RESET_BUTTON_ID);

  const revealedHexIds = new Set();
  let isFetching = false;
  const hexLookup = new Map();
  let activeSocket = null;
  const pendingInstructions = [];

  hexTiles.forEach((hexElement, index) => {
    const id = String(index);
    hexElement.dataset.hexId = id;
    hexElement.setAttribute("id", id);
    hexLookup.set(id, hexElement);

    if (isDungeonMaster) {
      hexElement.addEventListener("click", handleHexToggle);
    } else {
      hexElement.style.pointerEvents = "none";
    }
  });

  if (resetButton) {
    if (isDungeonMaster) {
      resetButton.addEventListener("click", handleReset);
    } else {
      resetButton.style.display = "none";
    }
  }

  void fetchInitialState();
  connectWebSocket();

  /**
   * Handles a DM click by sending a signed instruction to the service.
   */
  function handleHexToggle(event) {
    const hexElement = event.currentTarget;
    if (!hexElement) return;

    const hexId = hexElement.dataset.hexId;
    if (!hexId) return;

    const shouldCover = hexElement.classList.contains("off");
    const instructionValue = shouldCover ? Number(hexId) : -Number(hexId);
    applyLocalToggle(hexId, !shouldCover);
    void sendHexInstruction(instructionValue);
  }

  /**
   * Sends positive instructions for every revealed hex to re-cover them.
   */
  async function handleReset(event) {
    event.preventDefault();
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
      console.error("Failed to load revealed hexes", error);
    }
  }

  /**
   * Establishes the WebSocket connection and resubscribes on disconnect.
   */
  function connectWebSocket(attempt = 0) {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}${WS_ENDPOINT}`);
    activeSocket = ws;

    ws.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        applyServerState(payload?.hexes || []);
      } catch (parseError) {
        console.error("Invalid WebSocket payload", parseError);
      }
    });

    ws.addEventListener("open", () => {
      flushPendingInstructions();
    });

    ws.addEventListener("close", () => {
      if (activeSocket === ws) {
        activeSocket = null;
      }
      const nextAttempt = Math.min(attempt + 1, 5);
      const delay = Math.min(1000 * 2 ** attempt, 10000);
      setTimeout(() => connectWebSocket(nextAttempt), delay);
    });

    ws.addEventListener("error", () => {
      if (activeSocket === ws) {
        activeSocket = null;
      }
      ws.close();
    });
  }

  /**
   * Sends the signed instruction over the WebSocket connection.
   */
  function sendHexInstruction(value) {
    return new Promise((resolve) => {
      if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
        transmitInstruction(activeSocket, value, resolve);
        return;
      }

      pendingInstructions.push({ value, resolve });
    });
  }

  function flushPendingInstructions() {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (pendingInstructions.length) {
      const { value, resolve } = pendingInstructions.shift();
      transmitInstruction(activeSocket, value, resolve);
    }
  }

  function transmitInstruction(socket, value, resolve) {
    try {
      socket.send(JSON.stringify({ value }));
      resolve?.();
    } catch (error) {
      console.error("Failed to send hex instruction via WebSocket", error);
      pendingInstructions.unshift({ value, resolve });
      if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        connectWebSocket();
      }
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
        hexElement.classList.add("off");
      } else {
        hexElement.classList.remove("off");
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
      target.classList.add("off");
    } else {
      revealedHexIds.delete(String(hexId));
      target.classList.remove("off");
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
