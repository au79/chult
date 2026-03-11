import Panzoom from '@panzoom/panzoom';
import { useEffect, useRef } from 'react';
import { MAP_ASPECT_RATIO } from './mapCoordinateSpace';
import type { FitMapRequest, ViewportState } from './types';

type PanzoomChangeEvent = CustomEvent<{
  x: number;
  y: number;
  scale: number;
}>;

type ViewportMapFrame = {
  viewportLeft: number;
  viewportTop: number;
  viewportWidth: number;
  viewportHeight: number;
  mapLeft: number;
  mapTop: number;
  mapRight: number;
  mapBottom: number;
  mapWidth: number;
  mapHeight: number;
};

export function usePinchZoomViewport(
  panzoomElement: HTMLElement | null,
  containerElement: HTMLElement | null,
  fitMapRequest: FitMapRequest,
  onViewportChange: (viewport: ViewportState) => void,
) {
  // Scale 1 is the "fit to viewport" baseline for our `object-fit: contain`
  // map rendering. Keeping min scale at 1 prevents zooming out to a map that
  // is smaller than the viewport.
  const MIN_SCALE = 1;
  const MAX_SCALE = 6;
  const ZOOM_STEP = 0.1;
  const PAN_CLAMP_EPSILON = 0.01;

  const panzoomRef = useRef<ReturnType<typeof Panzoom> | null>(null);

  // Bootstraps Panzoom once the stage elements exist, then mirrors pan/zoom
  // changes back into app state through onViewportChange.
  useEffect(() => {
    if (!panzoomElement || !containerElement) {
      return;
    }

    const panzoom = Panzoom(panzoomElement, {
      minScale: MIN_SCALE,
      maxScale: MAX_SCALE,
      step: ZOOM_STEP,
      origin: '0 0',
    });
    panzoomRef.current = panzoom;

    const panzoomChangeEventListener = (event: Event) => {
      const detail = (event as PanzoomChangeEvent).detail;
      const frame = getViewportMapFrame(containerElement);
      const clampedPan = clampPanToViewport(
        { x: detail.x, y: detail.y },
        detail.scale,
        frame,
      );
      if (
        Math.abs(clampedPan.x - detail.x) > PAN_CLAMP_EPSILON ||
        Math.abs(clampedPan.y - detail.y) > PAN_CLAMP_EPSILON
      ) {
        panzoom.pan(clampedPan.x, clampedPan.y, { force: true });
        return;
      }

      onViewportChange({
        x: clampedPan.x,
        y: clampedPan.y,
        scale: detail.scale,
      });
    };

    const wheelEventListener = (event: WheelEvent) => {
      const isMouseWheel = event.deltaMode === WheelEvent.DOM_DELTA_LINE;
      if (event.ctrlKey || isMouseWheel) {
        event.preventDefault();

        // Replicate Panzoom's wheel scale curve: signed wheel delta ->
        // exponential scale multiplier, clamped to configured bounds.
        const delta =
          event.deltaY === 0 && event.deltaX ? event.deltaX : event.deltaY;
        const wheel = delta < 0 ? 1 : -1;
        const currentScale = panzoom.getScale();
        const unclampedScale = currentScale * Math.exp((wheel * ZOOM_STEP) / 3);
        const targetScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, unclampedScale),
        );

        // Focal point is pointer-relative to the viewport (clamped in-bounds),
        // with center fallback if browser does not provide client coordinates.
        const frame = getViewportMapFrame(containerElement);
        const relativeX = Number.isFinite(event.clientX)
          ? event.clientX - frame.viewportLeft
          : frame.viewportWidth / 2;
        const relativeY = Number.isFinite(event.clientY)
          ? event.clientY - frame.viewportTop
          : frame.viewportHeight / 2;
        const focalX = Math.min(frame.viewportWidth, Math.max(0, relativeX));
        const focalY = Math.min(frame.viewportHeight, Math.max(0, relativeY));

        panzoom.zoom(targetScale, {
          animate: false,
          focal: {
            // Panzoom focal input is in scaled coordinates.
            x: focalX * targetScale,
            y: focalY * targetScale,
          },
        });
        return;
      }

      // Trackpad two-axis scroll is treated as pan.
      event.preventDefault();
      const currentPan = panzoom.getPan();
      const currentScale = panzoom.getScale();
      const targetX = currentPan.x - event.deltaX;
      const targetY = currentPan.y - event.deltaY;
      const frame = getViewportMapFrame(containerElement);
      const clampedTargetPan = clampPanToViewport(
        { x: targetX, y: targetY },
        currentScale,
        frame,
      );

      // If we are at the pan boundary, swallow further wheel deltas to avoid
      // visible bounce/jitter from repeated overscroll corrections.
      if (
        Math.abs(clampedTargetPan.x - currentPan.x) <= PAN_CLAMP_EPSILON &&
        Math.abs(clampedTargetPan.y - currentPan.y) <= PAN_CLAMP_EPSILON
      ) {
        return;
      }

      panzoom.pan(clampedTargetPan.x, clampedTargetPan.y, { force: true });
    };

    panzoomElement.addEventListener(
      'panzoomchange',
      panzoomChangeEventListener,
    );
    containerElement.addEventListener('wheel', wheelEventListener, {
      passive: false,
    });

    const currentPan = panzoom.getPan();
    onViewportChange({
      x: currentPan.x,
      y: currentPan.y,
      scale: panzoom.getScale(),
    });

    // Cleanup behavior
    return () => {
      panzoomElement.removeEventListener(
        'panzoomchange',
        panzoomChangeEventListener,
      );
      containerElement.removeEventListener('wheel', wheelEventListener);
      panzoomRef.current = null;
      panzoom.destroy();
    };
  }, [containerElement, onViewportChange, panzoomElement]);

  // Applies one-shot fit requests by updating Panzoom's reset start values.
  useEffect(() => {
    if (!fitMapRequest || !containerElement || !panzoomRef.current) {
      return;
    }

    const panzoom = panzoomRef.current;
    const fitOptions = { startX: 0, startY: 0, startScale: 1 };

    if (fitMapRequest.mode === 'width') {
      const frame = getViewportMapFrame(containerElement);
      const targetScale = frame.viewportWidth / Math.max(frame.mapWidth, 1);

      const currentPan = panzoom.getPan();
      const currentPanY = Number.isFinite(currentPan.y) ? currentPan.y : 0;
      const currentScaleRaw = panzoom.getScale();
      const currentScale =
        Number.isFinite(currentScaleRaw) && currentScaleRaw > 0
          ? currentScaleRaw
          : 1;
      const viewportCenterY = frame.viewportHeight / 2;
      // Convert viewport-center screen Y -> map Y at current transform.
      // screenY = (mapY + panY) * scale  =>  mapY = screenY/scale - panY
      const centerMapY = viewportCenterY / currentScale - currentPanY;
      // Solve for the new panY that keeps the same mapY at viewport center
      // after changing scale to targetScale.
      const centeredPanY = viewportCenterY / targetScale - centerMapY;

      // Clamp so the map spans the viewport vertically when possible:
      // top edge at/above y=0 and bottom edge at/below viewport bottom.
      const clampedPan = clampPanToViewport(
        { x: -frame.mapLeft, y: centeredPanY },
        targetScale,
        frame,
      );

      fitOptions.startScale = targetScale;
      fitOptions.startX = Number.isFinite(clampedPan.x) ? clampedPan.x : 0;
      fitOptions.startY = Number.isFinite(clampedPan.y) ? clampedPan.y : 0;
    }

    panzoom.setOptions(fitOptions);
    panzoom.reset({ animate: true });

    const nextViewportPan = panzoom.getPan();
    onViewportChange({
      x: nextViewportPan.x,
      y: nextViewportPan.y,
      scale: panzoom.getScale(),
    });
  }, [containerElement, fitMapRequest, onViewportChange]);
}

function clampPanToViewport(
  pan: { x: number; y: number },
  scale: number,
  frame: ViewportMapFrame,
) {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const minPanX = frame.viewportWidth / safeScale - frame.mapRight;
  const maxPanX = -frame.mapLeft;
  const minPanY = frame.viewportHeight / safeScale - frame.mapBottom;
  const maxPanY = -frame.mapTop;

  return {
    x: clampAxis(minPanX, maxPanX, pan.x),
    y: clampAxis(minPanY, maxPanY, pan.y),
  };
}

function clampAxis(minPan: number, maxPan: number, value: number) {
  if (minPan <= maxPan) {
    return Math.min(maxPan, Math.max(minPan, value));
  }
  // If vertical coverage is impossible at this scale, pin to midpoint so
  // panning is effectively disabled on this axis instead of drifting.
  return (minPan + maxPan) / 2;
}

function getViewportMapFrame(containerElement: HTMLElement): ViewportMapFrame {
  const rect = containerElement.getBoundingClientRect();
  const viewportWidth = rect.width;
  const viewportHeight = rect.height;
  const containerAspectRatio = viewportWidth / Math.max(viewportHeight, 1);
  const mapWidth =
    containerAspectRatio > MAP_ASPECT_RATIO
      ? viewportHeight * MAP_ASPECT_RATIO
      : viewportWidth;
  const mapHeight =
    containerAspectRatio > MAP_ASPECT_RATIO
      ? viewportHeight
      : viewportWidth / MAP_ASPECT_RATIO;
  const mapLeft = (viewportWidth - mapWidth) / 2;
  const mapTop = (viewportHeight - mapHeight) / 2;

  return {
    viewportLeft: rect.left,
    viewportTop: rect.top,
    viewportWidth,
    viewportHeight,
    mapLeft,
    mapTop,
    mapRight: mapLeft + mapWidth,
    mapBottom: mapTop + mapHeight,
    mapWidth,
    mapHeight,
  };
}

export const __testables = {
  clampAxis,
  clampPanToViewport,
  getViewportMapFrame,
};
