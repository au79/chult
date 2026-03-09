import { useEffect, useRef } from 'react';
import { initHexVisibilityControls } from './runtime/hexControls';
import { registerPinchZoomElement } from './runtime/pinchZoom';
import { injectMapImage } from './mapImage';

type MapRole = 'dm' | 'player';

export function useMapRuntime(role: MapRole, ready: boolean) {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!ready || initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    registerPinchZoomElement();
    initHexVisibilityControls({ role });
    void injectMapImage();
  }, [ready, role]);
}
