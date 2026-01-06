import { describe, it, expect, beforeEach } from "vitest";
import {
  ensurePinchZoomStyles,
  upgradePinchZoomPlaceholders,
  resetPinchZoomDomStateForTests,
} from "../public/js/pinchZoomDom.js";

beforeEach(() => {
  resetPinchZoomDomStateForTests();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("pinchZoomDom helpers", () => {
  it("injects pinch-zoom styles only once", () => {
    ensurePinchZoomStyles();
    expect(document.head.querySelectorAll("style")).toHaveLength(1);

    ensurePinchZoomStyles();
    expect(document.head.querySelectorAll("style")).toHaveLength(1);
  });

  it("upgrades placeholders into pinch-zoom elements", () => {
    document.body.innerHTML = `
      <div data-pinch-zoom class="pinch-zoom-root">
        <div class="inner">content</div>
      </div>
    `;

    ensurePinchZoomStyles();
    upgradePinchZoomPlaceholders();

    const upgraded = document.querySelector("pinch-zoom");
    expect(upgraded).not.toBeNull();
    expect(upgraded.querySelector(".inner")).not.toBeNull();
  });
});
