import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { initHexVisibilityControls } from "../public/js/hexControls.js";

class MockWebSocket {
  static instances = [];
  static OPEN = 1;

  constructor() {
    this.listeners = new Map();
    this.sentMessages = [];
    this.OPEN = MockWebSocket.OPEN;
    this.readyState = MockWebSocket.OPEN;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(handler);
  }

  dispatch(type, event) {
    const handlers = this.listeners.get(type);
    if (!handlers) return;
    handlers.forEach((handler) => handler(event));
  }

  send(payload) {
    this.sentMessages.push(payload);
  }

  close() {
    this.readyState = 3;
    this.dispatch("close", new Event("close"));
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

function buildDom(hexCount = 3) {
  const hexes = Array.from({ length: hexCount }, () => '<div class="st0"></div>').join("");
  document.body.innerHTML = `
    <div class="container">
      <button id="reset" class="button reset"></button>
      ${hexes}
    </div>`;
}

function mockFetch(initialHexes = []) {
  return vi.fn((url, options) => {
    if (!options) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ hexes: initialHexes }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({}),
    });
  });
}

describe("initHexVisibilityControls", () => {
  beforeEach(() => {
    buildDom();
    MockWebSocket.reset();
    global.WebSocket = MockWebSocket;
    window.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    delete global.WebSocket;
    delete window.WebSocket;
    delete global.fetch;
  });

  it("disables player interactions and hides reset button", async () => {
    global.fetch = mockFetch([1]);

    initHexVisibilityControls({ role: "player" });
    await Promise.resolve();

    const hexTiles = document.querySelectorAll(".st0");
    hexTiles.forEach((hex) => {
      expect(hex.style.pointerEvents).toBe("none");
    });

    const resetButton = document.getElementById("reset");
    expect(resetButton.style.display).toBe("none");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith("/api/hexes");
  });

  it("sends signed instructions when the DM toggles a hex", async () => {
    global.fetch = mockFetch();

    initHexVisibilityControls({ role: "dm" });
    await Promise.resolve();

    const hexTiles = document.querySelectorAll(".st0");
    const targetHex = hexTiles[1];

    targetHex.dispatchEvent(new Event("click", { bubbles: true }));

    expect(targetHex.classList.contains("off")).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const socket = MockWebSocket.instances[0];
    expect(socket.sentMessages).toHaveLength(1);
    expect(JSON.parse(socket.sentMessages[0])).toEqual({ value: -1 });
  });

  it("applies WebSocket updates to the DOM", async () => {
    global.fetch = mockFetch();

    initHexVisibilityControls({ role: "player" });
    await Promise.resolve();

    const socket = MockWebSocket.instances[0];
    socket.dispatch("message", {
      data: JSON.stringify({ hexes: [1] }),
    });

    const hexTiles = document.querySelectorAll(".st0");
    expect(hexTiles[1].classList.contains("off")).toBe(true);
    expect(hexTiles[0].classList.contains("off")).toBe(false);
  });

  it("sends signed instructions for each revealed hex when resetting", async () => {
    const revealedHexes = [0, 1];

    global.fetch = vi.fn((url, options) => {
      if (!options) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ hexes: revealedHexes }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    initHexVisibilityControls({ role: "dm" });
    await flushMicrotasks();

    const resetButton = document.getElementById("reset");
    resetButton.dispatchEvent(new Event("click", { bubbles: true }));
    await flushMicrotasks();

    const socket = MockWebSocket.instances[0];
    const sentValues = socket.sentMessages.map((message) => JSON.parse(message).value);
    expect(sentValues).toEqual([0, 1]);
  });

  function flushMicrotasks() {
    return new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
});
