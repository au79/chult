import { useCallback, useRef } from 'react';
import type { ViewportState } from './types';

const INITIAL_VIEWPORT: ViewportState = { x: 0, y: 0, scale: 1 };

export function useMapViewport() {
  const viewportRef = useRef<ViewportState>(INITIAL_VIEWPORT);

  const updateViewport = useCallback((nextViewport: ViewportState) => {
    viewportRef.current = nextViewport;
  }, []);

  return {
    viewport: viewportRef.current,
    updateViewport,
  };
}
