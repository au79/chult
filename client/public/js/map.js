import { initHexVisibilityControls } from "./hexControls.js";
import { registerPinchZoomElement } from "./pinchZoom.js";

const isTestEnv = Boolean(
  typeof process !== "undefined" && process.env && process.env.VITEST,
);
let mapImageBase64Promise;

if (!isTestEnv) {
  initializeMapApp();
}

export function initializeMapApp() {
  if (typeof document === "undefined") {
    return;
  }
  void injectMapImage();
  const appRole = document.body?.dataset?.role || "player";
  initHexVisibilityControls({ role: appRole });
  registerPinchZoomElement();
}

export async function injectMapImage(imageBase64) {
  let resolvedImage = imageBase64;
  if (typeof resolvedImage === "undefined") {
    resolvedImage = await loadMapImageBase64();
  }

  const imageElement = document.querySelector("[data-map-image]");
  if (!imageElement) return;

  try {
    const bytes = base64ToUint8(resolvedImage || "");
    const objectUrl = createObjectUrl(bytes);
    imageElement.setAttribute("href", objectUrl);
    imageElement.setAttribute("xlink:href", objectUrl);
  } catch (error) {
    console.error("Failed to load map image", error);
  }
}

export function base64ToUint8(base64Data) {
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }
  return bytes;
}

export function createObjectUrl(bytes) {
  const blob = new Blob([bytes], { type: "image/jpeg" });
  const objectUrl = URL.createObjectURL(blob);
  window.addEventListener(
    "unload",
    () => {
      URL.revokeObjectURL(objectUrl);
    },
    { once: true },
  );
  return objectUrl;
}

async function loadMapImageBase64() {
  if (!mapImageBase64Promise) {
    if (isTestEnv) {
      mapImageBase64Promise = Promise.resolve("");
    } else {
      mapImageBase64Promise = import("./mapImageData.js").then(
        (module) => module.mapImageBase64,
      );
    }
  }
  return mapImageBase64Promise;
}
