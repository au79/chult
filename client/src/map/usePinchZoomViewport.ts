import Panzoom from '@panzoom/panzoom';
import { useEffect } from 'react';
import type { ViewportState } from './types';

type PanzoomChangeEvent = CustomEvent<{
  x: number;
  y: number;
  scale: number;
}>;

export function usePinchZoomViewport(
  panzoomElement: HTMLElement | null,
  containerElement: HTMLElement | null,
  onViewportChange: (viewport: ViewportState) => void,
) {
  useEffect(() => {
    if (!panzoomElement || !containerElement) {
      return;
    }

    const panzoom = Panzoom(panzoomElement, {
      minScale: 0.2,
      maxScale: 6,
      step: 0.1,
    });

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
      panzoom.destroy();
    };
  }, [containerElement, onViewportChange, panzoomElement]);
}
