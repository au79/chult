import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { initHexVisibilityControls } from "../public/js/hexControls.js";

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
    vi.useFakeTimers();
  });

  afterEach(() => {
    delete global.fetch;
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
    const responses = [
      { hexes: [] },
      { hexes: [1] },
    ];
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
    resetButton.dispatchEvent(new Event("click", { bubbles: true }));
    const resetFlush = flushMicrotasks();
    await vi.advanceTimersByTimeAsync(0);
    await resetFlush;

    expect(postCalls).toEqual([0, 1]);
  });

  function flushMicrotasks() {
    return new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
});
