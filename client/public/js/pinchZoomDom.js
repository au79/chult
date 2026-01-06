const PINCH_ZOOM_TAG = "pinch-zoom";
const PINCH_ZOOM_PLACEHOLDER_SELECTOR = "[data-pinch-zoom]";

const pinchZoomStyles = `pinch-zoom {
  display: block;
  overflow: hidden;
  touch-action: none;
  --scale: 1;
  --x: 0;
  --y: 0;
}

pinch-zoom > * {
  transform: translate(var(--x), var(--y)) scale(var(--scale));
  transform-origin: 0 0;
  will-change: transform;
}
`;

let pinchZoomStylesInjected = false;
let sharedSvgElement;

if (typeof document !== "undefined") {
  document.createElement(PINCH_ZOOM_TAG);
}

export function resetPinchZoomDomStateForTests() {
  pinchZoomStylesInjected = false;
  sharedSvgElement = undefined;
}

export function ensurePinchZoomStyles() {
  if (pinchZoomStylesInjected || typeof document === "undefined") {
    return;
  }
  injectStyleTag(pinchZoomStyles);
  pinchZoomStylesInjected = true;
}

export function upgradePinchZoomPlaceholders() {
  if (typeof document === "undefined") return;

  const placeholders = document.querySelectorAll(
    PINCH_ZOOM_PLACEHOLDER_SELECTOR,
  );
  placeholders.forEach((placeholder) => {
    const pinchElement = document.createElement(PINCH_ZOOM_TAG);
    copyAttributes(placeholder, pinchElement);
    while (placeholder.firstChild) {
      pinchElement.appendChild(placeholder.firstChild);
    }
    placeholder.replaceWith(pinchElement);
  });
}

export function createMatrix() {
  return getSharedSvg().createSVGMatrix();
}

export function createPoint() {
  return getSharedSvg().createSVGPoint();
}

function copyAttributes(source, target) {
  Array.from(source.attributes).forEach((attribute) => {
    if (attribute.name === "data-pinch-zoom") {
      return;
    }
    target.setAttribute(attribute.name, attribute.value);
  });
}

function injectStyleTag(cssText, options = {}) {
  const { insertAt } = options;
  if (!cssText || typeof document === "undefined") return;

  const head = document.head || document.getElementsByTagName("head")[0];
  const styleElement = document.createElement("style");

  if (insertAt === "top" && head.firstChild) {
    head.insertBefore(styleElement, head.firstChild);
  } else {
    head.appendChild(styleElement);
  }

  styleElement.appendChild(document.createTextNode(cssText));
}

function getSharedSvg() {
  if (!sharedSvgElement) {
    sharedSvgElement = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
  }
  return sharedSvgElement;
}

export {
  PINCH_ZOOM_TAG,
  PINCH_ZOOM_PLACEHOLDER_SELECTOR,
};
