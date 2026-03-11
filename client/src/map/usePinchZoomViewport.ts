import Panzoom from '@panzoom/panzoom';
import { useEffect, useRef } from 'react';
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
  const panzoomRef = useRef<ReturnType<typeof Panzoom> | null>(null);

  useEffect(() => {
    if (!panzoomElement || !containerElement) {
      return;
    }

    const panzoom = Panzoom(panzoomElement, {
      minScale: 0.2,
      maxScale: 6,
      step: 0.1,
    });
    panzoomRef.current = panzoom;

    const handlePanzoomChange = (event: Event) => {
      const detail = (event as PanzoomChangeEvent).detail;
      onViewportChange({
        x: detail.x,
        y: detail.y,
        scale: detail.scale,
      });
    };

    const handleWheel = (event: WheelEvent) => {
      const isMouseWheel = event.deltaMode === WheelEvent.DOM_DELTA_LINE;
      if (event.ctrlKey || isMouseWheel) {
        panzoom.zoomWithWheel(event);
        return;
      }

      event.preventDefault();
      panzoom.pan(-event.deltaX, -event.deltaY, {
        relative: true,
        force: true,
      });
    };

    panzoomElement.addEventListener('panzoomchange', handlePanzoomChange);
    containerElement.addEventListener('wheel', handleWheel, { passive: false });

    const currentPan = panzoom.getPan();
    onViewportChange({
      x: currentPan.x,
      y: currentPan.y,
      scale: panzoom.getScale(),
    });

    return () => {
      panzoomElement.removeEventListener('panzoomchange', handlePanzoomChange);
      containerElement.removeEventListener('wheel', handleWheel);
      panzoomRef.current = null;
      panzoom.destroy();
    };
  }, [containerElement, onViewportChange, panzoomElement]);

  useEffect(() => {
    if (!fitMapRequest || !containerElement || !panzoomRef.current) {
      return;
    }

    const panzoom = panzoomRef.current;
    const fitOptions = { startX: 0, startY: 0, startScale: 1 };

    if (fitMapRequest.mode === 'width') {
      const containerRect = containerElement.getBoundingClientRect();
      const mapAspectRatio = 4476 / 6000;
      const containerAspectRatio = containerRect.width / containerRect.height;
      const baseVisibleWidth =
        containerAspectRatio > mapAspectRatio
          ? containerRect.height * mapAspectRatio
          : containerRect.width;
      fitOptions.startScale =
        containerRect.width / Math.max(baseVisibleWidth, 1);
    }

    panzoom.setOptions(fitOptions);
    panzoom.reset({ animate: true });

    const currentPan = panzoom.getPan();
    onViewportChange({
      x: currentPan.x,
      y: currentPan.y,
      scale: panzoom.getScale(),
    });
  }, [containerElement, fitMapRequest, onViewportChange]);
}
