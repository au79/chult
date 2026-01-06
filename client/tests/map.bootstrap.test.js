import { describe, it, expect, vi } from "vitest";

vi.mock("../public/js/hexControls.js", () => ({
  initHexVisibilityControls: vi.fn(),
}));

vi.mock("../public/js/pinchZoom.js", () => ({
  registerPinchZoomElement: vi.fn(),
}));

import { initHexVisibilityControls } from "../public/js/hexControls.js";
import { registerPinchZoomElement } from "../public/js/pinchZoom.js";

describe("map bootstrap guard", () => {
  it("only runs initializeMapApp when VITEST env is unset", async () => {
    process.env.VITEST = "1";
    const moduleWithEnv = await import("../public/js/map.js");
    expect(() => moduleWithEnv.initializeMapApp()).not.toThrow();

    delete process.env.VITEST;
    initHexVisibilityControls.mockReset();
    registerPinchZoomElement.mockReset();
    vi.spyOn(moduleWithEnv, "injectMapImage").mockResolvedValue();

    await moduleWithEnv.initializeMapApp();

    expect(initHexVisibilityControls).toHaveBeenCalledWith({ role: "player" });
    expect(registerPinchZoomElement).toHaveBeenCalledTimes(1);
  });
});
