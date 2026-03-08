import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { initHexVisibilityControls } from "../public/js/hexControls.js";

function buildDom(hexCount = 3) {
  const hexes = Array.from(
    { length: hexCount },
    () => '<div class="st0"></div>',
  ).join("");
  document.body.innerHTML = `
    <div class="container">
      <button id="reset" class="button reset"></button>
      ${hexes}
    </div>`;
}

function buildDmMenuDom(hexCount = 3) {
  const hexes = Array.from(
    { length: hexCount },
    () => '<div class="st0"></div>',
  ).join("");
  document.body.innerHTML = `
    <div class="container">
      <div id="dm-menu-shell" class="dm-menu-shell">
        <div id="dm-menu" class="dm-menu">
          <button id="reset" class="button menu-item reset-action"></button>
          <label class="menu-item opacity-control" for="hex-opacity">
            <span id="hex-opacity-value">65%</span>
            <input id="hex-opacity" type="range" min="10" max="100" value="65" />
          </label>
        </div>
        <button id="menu-toggle" class="button menu-toggle">
          <span class="menu-toggle-icon">
            <span class="menu-toggle-line"></span>
            <span class="menu-toggle-line"></span>
            <span class="menu-toggle-line"></span>
          </span>
        </button>
      </div>
      <div id="reset-confirm-modal" class="modal-overlay">
        <div class="modal-content">
          <button id="reset-confirm" class="button modal-button danger"></button>
          <button id="reset-cancel" class="button modal-button"></button>
        </div>
      </div>
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
    vi.useFakeTimers();
  });

  afterEach(() => {
    delete global.fetch;
    document.documentElement.style.removeProperty("--hex-opacity");
    window.localStorage.clear();
    vi.useRealTimers();
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
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [, [, postOptions]] = global.fetch.mock.calls;
    expect(postOptions.method).toBe("POST");
    expect(JSON.parse(postOptions.body)).toEqual({ value: -1 });
  });

  it("applies polling updates to the DOM", async () => {
    const responses = [{ hexes: [] }, { hexes: [1] }];
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => responses.shift() ?? { hexes: [] },
      }),
    );

    initHexVisibilityControls({ role: "player" });
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();

    const hexTiles = document.querySelectorAll(".st0");
    expect(hexTiles[1].classList.contains("off")).toBe(true);
    expect(hexTiles[0].classList.contains("off")).toBe(false);
  });

  it("sends signed instructions for each revealed hex when resetting", async () => {
    buildDmMenuDom();
    const revealedHexes = [0, 1];
    const postCalls = [];

    global.fetch = vi.fn((url, options) => {
      if (!options) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ hexes: revealedHexes }),
        });
      }
      postCalls.push(JSON.parse(options.body).value);
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    initHexVisibilityControls({ role: "dm" });
    const initialLoad = flushMicrotasks();
    await vi.advanceTimersByTimeAsync(0);
    await initialLoad;

    const resetButton = document.getElementById("reset");
    const confirmButton = document.getElementById("reset-confirm");
    resetButton.dispatchEvent(new Event("click", { bubbles: true }));
    confirmButton.dispatchEvent(new Event("click", { bubbles: true }));
    const resetFlush = flushMicrotasks();
    await vi.advanceTimersByTimeAsync(0);
    await resetFlush;

    expect(postCalls).toEqual([0, 1]);
  });

  it("toggles DM menu and closes when clicking away", async () => {
    buildDmMenuDom();
    global.fetch = mockFetch();

    initHexVisibilityControls({ role: "dm" });
    await Promise.resolve();

    const menuToggle = document.getElementById("menu-toggle");
    const menuShell = document.getElementById("dm-menu-shell");

    menuToggle.dispatchEvent(new Event("click", { bubbles: true }));
    expect(menuShell.classList.contains("open")).toBe(true);
    expect(menuToggle.classList.contains("open")).toBe(true);

    document.body.dispatchEvent(new Event("click", { bubbles: true }));
    expect(menuShell.classList.contains("open")).toBe(false);
    expect(menuToggle.classList.contains("open")).toBe(false);
  });

  it("updates hex opacity from the DM slider", async () => {
    buildDmMenuDom();
    global.fetch = mockFetch();

    initHexVisibilityControls({ role: "dm" });
    await Promise.resolve();

    const slider = document.getElementById("hex-opacity");
    const valueLabel = document.getElementById("hex-opacity-value");

    slider.value = "35";
    slider.dispatchEvent(new Event("input", { bubbles: true }));

    expect(
      document.documentElement.style.getPropertyValue("--hex-opacity"),
    ).toBe("0.35");
    expect(valueLabel.textContent).toBe("35%");
    expect(window.localStorage.getItem("dmHexOpacityPercent")).toBe("35");
  });

  it("loads saved DM opacity from local storage", async () => {
    buildDmMenuDom();
    window.localStorage.setItem("dmHexOpacityPercent", "42");
    global.fetch = mockFetch();

    initHexVisibilityControls({ role: "dm" });
    await Promise.resolve();

    const slider = document.getElementById("hex-opacity");
    const valueLabel = document.getElementById("hex-opacity-value");

    expect(slider.value).toBe("42");
    expect(
      document.documentElement.style.getPropertyValue("--hex-opacity"),
    ).toBe("0.42");
    expect(valueLabel.textContent).toBe("42%");
  });

  it("uses 65% as DM default opacity when nothing is stored", async () => {
    buildDmMenuDom();
    global.fetch = mockFetch();

    initHexVisibilityControls({ role: "dm" });
    await Promise.resolve();

    const slider = document.getElementById("hex-opacity");
    const valueLabel = document.getElementById("hex-opacity-value");

    expect(slider.value).toBe("65");
    expect(
      document.documentElement.style.getPropertyValue("--hex-opacity"),
    ).toBe("0.65");
    expect(valueLabel.textContent).toBe("65%");
  });

  it("forces player opacity to 100%", async () => {
    document.documentElement.style.setProperty("--hex-opacity", "0.22");
    global.fetch = mockFetch();

    initHexVisibilityControls({ role: "player" });
    await Promise.resolve();

    expect(
      document.documentElement.style.getPropertyValue("--hex-opacity"),
    ).toBe("1");
  });

  function flushMicrotasks() {
    return new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
});
