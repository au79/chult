import { describe, it, expect, beforeEach, vi } from "vitest";

const domMocks = vi.hoisted(() => {
  return {
    ensurePinchZoomStyles: vi.fn(),
    upgradePinchZoomPlaceholders: vi.fn(),
  };
});

vi.mock("../public/js/pinchZoomDom.js", () => ({
  PINCH_ZOOM_TAG: "pinch-zoom",
  ensurePinchZoomStyles: domMocks.ensurePinchZoomStyles,
  upgradePinchZoomPlaceholders: domMocks.upgradePinchZoomPlaceholders,
  createMatrix: () => ({
    a: 1,
    d: 1,
    e: 0,
    f: 0,
    translate() {
      return this;
    },
    scale() {
      return this;
    },
    multiply() {
      return this;
    },
    inverse() {
      return this;
    },
  }),
  createPoint: () => ({
    x: 0,
    y: 0,
    matrixTransform() {
      return { x: 0, y: 0 };
    },
  }),
}));

import { registerPinchZoomElement } from "../public/js/pinchZoom.js";

beforeEach(() => {
  domMocks.ensurePinchZoomStyles.mockClear();
  domMocks.upgradePinchZoomPlaceholders.mockClear();
  global.customElements = {
    define: vi.fn(),
    get: vi.fn(),
  };
});

describe("registerPinchZoomElement", () => {
  it("defines the element when not registered", () => {
    customElements.get.mockReturnValue(undefined);

    registerPinchZoomElement();

    expect(domMocks.ensurePinchZoomStyles).toHaveBeenCalledTimes(1);
    expect(customElements.define).toHaveBeenCalledWith(
      "pinch-zoom",
      expect.any(Function),
    );
    expect(domMocks.upgradePinchZoomPlaceholders).toHaveBeenCalledTimes(1);
  });

  it("skips define when custom element already exists", () => {
    customElements.get.mockReturnValue(() => {});

    registerPinchZoomElement();

    expect(customElements.define).not.toHaveBeenCalled();
    expect(domMocks.upgradePinchZoomPlaceholders).toHaveBeenCalledTimes(1);
  });
});
