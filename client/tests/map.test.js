import { describe, expect, it, vi } from "vitest";
import { base64ToUint8, createObjectUrl, injectMapImage, } from "../public/js/map.js";

describe("map helpers", () => {
    it("decodes base64 strings into byte arrays", () => {
        const bytes = base64ToUint8("AQID");
        expect(Array.from(bytes)).toEqual([1, 2, 3]);
    });

    it("creates object URLs and revokes them on unload", () => {
        const revokeMock = vi.fn();
        const createMock = vi.fn(() => "blob:test");
        const unloadHandlers = [];
        const addEventListenerSpy = vi
            .spyOn(window, "addEventListener");
        addEventListenerSpy.mockImplementation((event, handler) => {
            if (event === "unload") {
                unloadHandlers.push(handler);
            }
        });

        vi.spyOn(URL, "createObjectURL").mockImplementation(createMock);
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(revokeMock);

        const bytes = new Uint8Array([1]);
        const objectUrl = createObjectUrl(bytes);

        expect(objectUrl).toBe("blob:test");
        expect(createMock).toHaveBeenCalledTimes(1);
        expect(unloadHandlers).toHaveLength(1);

        unloadHandlers[0]?.();
        expect(revokeMock).toHaveBeenCalledWith("blob:test");

        addEventListenerSpy.mockRestore();
    });

    it("injects the generated map image into the DOM", async () => {
        document.body.innerHTML = `
      <svg>
        <image data-map-image></image>
      </svg>
    `;

        const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:img");
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {
        });

        await injectMapImage("AQID");

        const imageElement = document.querySelector("[data-map-image]");
        expect(imageElement.getAttribute("href")).toBe("blob:img");
        expect(imageElement.getAttribute("xlink:href")).toBe("blob:img");

        createSpy.mockRestore();
    });
});
