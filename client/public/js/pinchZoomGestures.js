function calculateDistance(pointerA, pointerB) {
  if (!pointerB) return 0;
  return Math.sqrt(
    Math.pow(pointerB.clientX - pointerA.clientX, 2) +
      Math.pow(pointerB.clientY - pointerA.clientY, 2),
  );
}

function calculateMidpoint(pointerA, pointerB) {
  if (!pointerB) {
    return pointerA;
  }
  return {
    clientX: (pointerA.clientX + pointerB.clientX) / 2,
    clientY: (pointerA.clientY + pointerB.clientY) / 2,
  };
}

function resolveLength(input, referenceLength) {
  if (typeof input === "number") {
    return input;
  }
  if (input.trimEnd().endsWith("%")) {
    return (referenceLength * parseFloat(input)) / 100;
  }
  return parseFloat(input);
}

function isPointerEvent(event) {
  return window.PointerEvent && event instanceof PointerEvent;
}

function allowPointerStartByDefault() {
  return true;
}

function noopPointerMoveHandler() {}

function noopPointerEndHandler() {}

class TrackedPointer {
  constructor(nativePointer) {
    this.id = -1;
    this.nativePointer = nativePointer;
    this.pageX = nativePointer.pageX;
    this.pageY = nativePointer.pageY;
    this.clientX = nativePointer.clientX;
    this.clientY = nativePointer.clientY;

    if (window.Touch && nativePointer instanceof Touch) {
      this.id = nativePointer.identifier;
    } else if (isPointerEvent(nativePointer)) {
      this.id = nativePointer.pointerId;
    }
  }

  getCoalescedPointers() {
    if ("getCoalescedEvents" in this.nativePointer) {
      return this.nativePointer
        .getCoalescedEvents()
        .map((event) => new TrackedPointer(event));
    }
    return [this];
  }
}

class PointerSession {
  constructor(element, callbacks) {
    this.element = element;
    this.startPointers = [];
    this.currentPointers = [];

    const {
      start: startCallback = allowPointerStartByDefault,
      move: moveCallback = noopPointerMoveHandler,
      end: endCallback = noopPointerEndHandler,
    } = callbacks;

    this.startCallback = startCallback;
    this.moveCallback = moveCallback;
    this.endCallback = endCallback;

    this.handlePointerStart = this.handlePointerStart.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleMove = this.handleMove.bind(this);
    this.handlePointerEnd = this.handlePointerEnd.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);

    const supportsTouch = "ontouchstart" in window ||
      navigator.msMaxTouchPoints;

    if (window.PointerEvent && supportsTouch) {
      this.element.addEventListener("pointerdown", this.handlePointerStart);
    } else {
      this.element.addEventListener("mousedown", this.handlePointerStart);
      this.element.addEventListener("touchstart", this.handleTouchStart);
      this.element.addEventListener("touchmove", this.handleMove);
      this.element.addEventListener("touchend", this.handleTouchEnd);
    }
  }

  triggerPointerStart(pointer, event) {
    if (!this.startCallback(pointer, event)) {
      return false;
    }
    this.currentPointers.push(pointer);
    this.startPointers.push(pointer);
    return true;
  }

  handlePointerStart(event) {
    if (event.button !== 0) return;

    if (this.triggerPointerStart(new TrackedPointer(event), event)) {
      if (isPointerEvent(event)) {
        this.element.setPointerCapture(event.pointerId);
        this.element.addEventListener("pointermove", this.handleMove);
        this.element.addEventListener("pointerup", this.handlePointerEnd);
      } else {
        window.addEventListener("mousemove", this.handleMove);
        window.addEventListener("mouseup", this.handlePointerEnd);
      }
    }
  }

  handleTouchStart(event) {
    Array.from(event.changedTouches).forEach((touch) => {
      this.triggerPointerStart(new TrackedPointer(touch), event);
    });
  }

  handleMove(event) {
    const previousPointers = this.currentPointers.slice();
    const changedPointers = "changedTouches" in event
      ? Array.from(event.changedTouches).map(
        (touch) => new TrackedPointer(touch),
      )
      : [new TrackedPointer(event)];

    const updatedPointers = [];

    changedPointers.forEach((changedPointer) => {
      const pointerIndex = this.currentPointers.findIndex(
        (pointer) => pointer.id === changedPointer.id,
      );
      if (pointerIndex === -1) {
        return;
      }
      updatedPointers.push(changedPointer);
      this.currentPointers[pointerIndex] = changedPointer;
    });

    if (updatedPointers.length > 0) {
      this.moveCallback(previousPointers, updatedPointers, event);
    }
  }

  triggerPointerEnd(pointer, event) {
    const pointerIndex = this.currentPointers.findIndex(
      (storedPointer) => storedPointer.id === pointer.id,
    );
    if (pointerIndex === -1) {
      return false;
    }
    this.currentPointers.splice(pointerIndex, 1);
    this.startPointers.splice(pointerIndex, 1);
    this.endCallback(pointer, event);
    return true;
  }

  handlePointerEnd(event) {
    if (this.triggerPointerEnd(new TrackedPointer(event), event)) {
      if (isPointerEvent(event)) {
        if (this.currentPointers.length) {
          return;
        }
        this.element.removeEventListener("pointermove", this.handleMove);
        this.element.removeEventListener("pointerup", this.handlePointerEnd);
      } else {
        window.removeEventListener("mousemove", this.handleMove);
        window.removeEventListener("mouseup", this.handlePointerEnd);
      }
    }
  }

  handleTouchEnd(event) {
    Array.from(event.changedTouches).forEach((touch) => {
      this.triggerPointerEnd(new TrackedPointer(touch), event);
    });
  }
}

export {
  PointerSession,
  calculateDistance,
  calculateMidpoint,
  resolveLength,
};
