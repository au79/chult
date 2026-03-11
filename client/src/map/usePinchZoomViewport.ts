import Panzoom from '@panzoom/panzoom';
import { useEffect, useRef } from 'react';
import { MAP_ASPECT_RATIO } from './mapCoordinateSpace';
import type { FitMapRequest, ViewportState } from './types';

type PanzoomChangeEvent = CustomEvent<{
  x: number;
  y: number;
  scale: number;
}>;

export function usePinchZoomViewport(
  panzoomElement: HTMLElement | null,
  containerElement: HTMLElement | null,
  fitMapRequest: FitMapRequest,
  onViewportChange: (viewport: ViewportState) => void,
) {
  const MIN_SCALE = 0.2;
  const MAX_SCALE = 6;
  const ZOOM_STEP = 0.1;

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
      onViewportChange({
        x: detail.x,
        y: detail.y,
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
        const rect = containerElement.getBoundingClientRect();
        const relativeX = Number.isFinite(event.clientX)
          ? event.clientX - rect.left
          : rect.width / 2;
        const relativeY = Number.isFinite(event.clientY)
          ? event.clientY - rect.top
          : rect.height / 2;
        const focalX = Math.min(rect.width, Math.max(0, relativeX));
        const focalY = Math.min(rect.height, Math.max(0, relativeY));

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
      panzoom.pan(-event.deltaX, -event.deltaY, {
        relative: true,
        force: true,
      });
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
      const containerRect = containerElement.getBoundingClientRect();
      const containerAspectRatio = containerRect.width / containerRect.height;
      const baseMapWidth =
        containerAspectRatio > MAP_ASPECT_RATIO
          ? containerRect.height * MAP_ASPECT_RATIO
          : containerRect.width;
      const baseMapHeight =
        containerAspectRatio > MAP_ASPECT_RATIO
          ? containerRect.height
          : containerRect.width / MAP_ASPECT_RATIO;
      const baseMapLeft = (containerRect.width - baseMapWidth) / 2;
      const baseMapTop = (containerRect.height - baseMapHeight) / 2;
      const targetScale = containerRect.width / Math.max(baseMapWidth, 1);
      const baseMapBottom = baseMapTop + baseMapHeight;

      const currentPan = panzoom.getPan();
      const currentPanY = Number.isFinite(currentPan.y) ? currentPan.y : 0;
      const currentScaleRaw = panzoom.getScale();
      const currentScale =
        Number.isFinite(currentScaleRaw) && currentScaleRaw > 0
          ? currentScaleRaw
          : 1;
      const viewportCenterY = containerRect.height / 2;
      // Convert viewport-center screen Y -> map Y at current transform.
      // screenY = (mapY + panY) * scale  =>  mapY = screenY/scale - panY
      const centerMapY = viewportCenterY / currentScale - currentPanY;
      // Solve for the new panY that keeps the same mapY at viewport center
      // after changing scale to targetScale.
      const centeredPanY = viewportCenterY / targetScale - centerMapY;

      // Clamp so the map spans the viewport vertically when possible:
      // top edge at/above y=0 and bottom edge at/below viewport bottom.
      const minPanY = containerRect.height / targetScale - baseMapBottom;
      const maxPanY = -baseMapTop;
      const clampedPanY =
        minPanY <= maxPanY
          ? Math.min(maxPanY, Math.max(minPanY, centeredPanY))
          : centeredPanY > maxPanY
            ? maxPanY
            : minPanY;

      // Panzoom startX/startY are translation units before scale is applied.
      fitOptions.startX = -baseMapLeft;

      fitOptions.startScale = targetScale;
      fitOptions.startY = Number.isFinite(clampedPanY) ? clampedPanY : 0;
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
