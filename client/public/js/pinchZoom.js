import {
  PINCH_ZOOM_TAG,
  ensurePinchZoomStyles,
  upgradePinchZoomPlaceholders,
  createMatrix,
  createPoint,
} from "./pinchZoomDom.js";
import {
  PointerSession,
  calculateDistance,
  calculateMidpoint,
  resolveLength,
} from "./pinchZoomGestures.js";

export function registerPinchZoomElement() {
  ensurePinchZoomStyles();

  if (!customElements.get(PINCH_ZOOM_TAG)) {
    customElements.define(PINCH_ZOOM_TAG, PinchZoomElement);
  }

  upgradePinchZoomPlaceholders();
}

/**
 * Custom element that applies pinch/zoom gestures to its single child.
 */
class PinchZoomElement extends HTMLElement {
  /**
   * Configures the gesture helpers and observers needed for this element.
   */
  constructor() {
    super();
    this._transform = createMatrix();
    this._positioningEl = undefined;

    new MutationObserver(() => this._handleChildMutations()).observe(this, {
      childList: true,
    });

    let pointerSession;

    /**
     * Validates whether a new pointer should be tracked in the session.
     */
    const handleSessionStart = (_, nativeEvent) => {
      if (
        pointerSession.currentPointers.length === 2 ||
        !this._positioningEl
      ) {
        return false;
      }
      nativeEvent.preventDefault();
      return true;
    };

    /**
     * Applies pointer movement deltas coming from the session manager.
     */
    const handleSessionMove = (previousPointers) => {
      this._handlePointerMove(
        previousPointers,
        pointerSession.currentPointers,
      );
    };

    pointerSession = new PointerSession(this, {
      start: handleSessionStart,
      move: handleSessionMove,
    });

    this.addEventListener("wheel", (event) => this._handleWheel(event));
  }

  /**
   * Reacts to attribute changes to enforce minimum scale constraints.
   */
  attributeChangedCallback(name) {
    if (name === "min-scale" && this.scale < this.minScale) {
      this.setTransform({ scale: this.minScale });
    }
  }

  /**
   * Ensures the child reference is up to date when the element connects.
   */
  connectedCallback() {
    this._handleChildMutations();
  }

  /**
   * Applies an absolute scale while respecting gesture origin settings.
   */
  scaleTo(nextScale, options = {}) {
    const {
      originX = 0,
      originY = 0,
      relativeTo = "content",
      allowChangeEvent = false,
    } = options;

    const referenceElement = relativeTo === "content"
      ? this._positioningEl
      : this;

    if (referenceElement && this._positioningEl) {
      const referenceRect = referenceElement.getBoundingClientRect();
      let resolvedOriginX = resolveLength(originX, referenceRect.width);
      let resolvedOriginY = resolveLength(originY, referenceRect.height);

      if (relativeTo === "content") {
        resolvedOriginX += this.x;
        resolvedOriginY += this.y;
      } else {
        const positioningRect = this._positioningEl.getBoundingClientRect();
        resolvedOriginX -= positioningRect.left;
        resolvedOriginY -= positioningRect.top;
      }

      this._applyChange({
        allowChangeEvent,
        originX: resolvedOriginX,
        originY: resolvedOriginY,
        scaleDiff: nextScale / this.scale,
      });
    } else {
      this.setTransform({ scale: nextScale, allowChangeEvent });
    }
  }

  /**
   * Updates the element's transform while clamping panning to bounds.
   */
  setTransform({
    scale = this.scale,
    allowChangeEvent = false,
    x = this.x,
    y = this.y,
  } = {}) {
    if (this._positioningEl) {
      const hostRect = this.getBoundingClientRect();
      const contentRect = this._positioningEl.getBoundingClientRect();

      if (hostRect.width && hostRect.height) {
        const topLeft = createPoint();
        topLeft.x = contentRect.left - hostRect.left;
        topLeft.y = contentRect.top - hostRect.top;

        const bottomRight = createPoint();
        bottomRight.x = contentRect.width + topLeft.x;
        bottomRight.y = contentRect.height + topLeft.y;

        const adjustmentMatrix = createMatrix()
          .translate(x, y)
          .scale(scale)
          .multiply(this._transform.inverse());

        const transformedTopLeft = topLeft.matrixTransform(adjustmentMatrix);
        const transformedBottomRight = bottomRight.matrixTransform(
          adjustmentMatrix,
        );

        if (transformedTopLeft.x > hostRect.width) {
          x += hostRect.width - transformedTopLeft.x;
        } else if (transformedBottomRight.x < 0) {
          x += -transformedBottomRight.x;
        }

        if (transformedTopLeft.y > hostRect.height) {
          y += hostRect.height - transformedTopLeft.y;
        } else if (transformedBottomRight.y < 0) {
          y += -transformedBottomRight.y;
        }

        this._updateTransform(scale, x, y, allowChangeEvent);
        return;
      }
    }

    this._updateTransform(scale, x, y, allowChangeEvent);
  }

  /**
   * Writes the transform values to CSS custom properties and fires change events.
   */
  _updateTransform(nextScale, nextX, nextY, allowChangeEvent) {
    if (nextScale < this.minScale) {
      return;
    }

    const hasChanged = nextScale !== this.scale || nextX !== this.x ||
      nextY !== this.y;

    if (!hasChanged) {
      return;
    }

    this._transform.e = nextX;
    this._transform.f = nextY;
    this._transform.d = this._transform.a = nextScale;

    this.style.setProperty("--x", `${this.x}px`);
    this.style.setProperty("--y", `${this.y}px`);
    this.style.setProperty("--scale", `${this.scale}`);

    if (allowChangeEvent) {
      this.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  /**
   * Updates the cached child element whenever the DOM changes.
   */
  _handleChildMutations() {
    this._positioningEl = undefined;
    if (!this.children.length) {
      return;
    }

    this._positioningEl = this.children[0];
    if (this.children.length > 1) {
      console.warn("<pinch-zoom> must not have more than one child.");
    }
    this.setTransform({ allowChangeEvent: true });
  }

  /**
   * Handles wheel-based zoom gestures (trackpad/ctrl+wheel).
   */
  _handleWheel(event) {
    if (!this._positioningEl || !this.children[0]) {
      return;
    }

    this.children[0].classList.add("smooth");
    event.preventDefault();

    const contentRect = this._positioningEl.getBoundingClientRect();
    let deltaY = event.deltaY;
    const isCtrlZoom = event.ctrlKey;

    if (event.deltaMode === 1) {
      deltaY *= 10;
    }

    const scaleDiff = 1 - deltaY / (isCtrlZoom ? 100 : 300);

    this._applyChange({
      scaleDiff,
      originX: event.clientX - contentRect.left,
      originY: event.clientY - contentRect.top,
      allowChangeEvent: true,
    });
  }

  /**
   * Handles pointer-move updates to apply pinch/zoom and pan math.
   */
  _handlePointerMove(previousPointers, currentPointers) {
    if (this.children[0]) {
      this.children[0].classList.remove("smooth");
    }

    if (!this._positioningEl || !previousPointers.length) {
      return;
    }

    const contentRect = this._positioningEl.getBoundingClientRect();
    const previousMidpoint = calculateMidpoint(
      previousPointers[0],
      previousPointers[1],
    );
    const activeCurrentPointers = currentPointers.length
      ? currentPointers
      : previousPointers;
    const currentMidpoint = calculateMidpoint(
      activeCurrentPointers[0],
      activeCurrentPointers[1],
    );
    const originX = previousMidpoint.clientX - contentRect.left;
    const originY = previousMidpoint.clientY - contentRect.top;
    const previousDistance = calculateDistance(
      previousPointers[0],
      previousPointers[1],
    );
    const currentDistance = calculateDistance(
      activeCurrentPointers[0],
      activeCurrentPointers[1],
    );
    const scaleRatio = previousDistance
      ? currentDistance / previousDistance
      : 1;

    this._applyChange({
      originX,
      originY,
      scaleDiff: scaleRatio,
      panX: currentMidpoint.clientX - previousMidpoint.clientX,
      panY: currentMidpoint.clientY - previousMidpoint.clientY,
      allowChangeEvent: true,
    });
  }

  /**
   * Applies incremental pan/zoom deltas to the stored transform.
   */
  _applyChange({
    panX = 0,
    panY = 0,
    originX = 0,
    originY = 0,
    scaleDiff = 1,
    allowChangeEvent = false,
  } = {}) {
    const adjustmentMatrix = createMatrix()
      .translate(panX, panY)
      .translate(originX, originY)
      .translate(this.x, this.y)
      .scale(scaleDiff)
      .translate(-originX, -originY)
      .scale(this.scale);

    this.setTransform({
      allowChangeEvent,
      scale: adjustmentMatrix.a,
      x: adjustmentMatrix.e,
      y: adjustmentMatrix.f,
    });
  }

  /**
   * Returns the enforced minimum scale for the element.
   */
  get minScale() {
    const attributeValue = this.getAttribute("min-scale");
    if (!attributeValue) {
      return 0.25;
    }
    const parsedValue = parseFloat(attributeValue);
    return Number.isFinite(parsedValue) ? Math.max(0.25, parsedValue) : 0.25;
  }

  /**
   * Overrides the minimum scale attribute via property assignment.
   */
  set minScale(value) {
    this.setAttribute("min-scale", String(value));
  }

  /**
   * Returns the current x translation value.
   */
  get x() {
    return this._transform.e;
  }

  /**
   * Returns the current y translation value.
   */
  get y() {
    return this._transform.f;
  }

  /**
   * Returns the current scale factor from the transform.
   */
  get scale() {
    return this._transform.a;
  }

  /**
   * Static getter required by Custom Elements to observe min-scale changes.
   */
  static get observedAttributes() {
    return ["min-scale"];
  }
}
