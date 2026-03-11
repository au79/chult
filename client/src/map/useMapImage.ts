import { useEffect } from 'react';
import { injectMapImage } from './mapImage';

export function useMapImage(imageElement: HTMLImageElement | null) {
  useEffect(() => {
    if (!imageElement) {
      return;
    }

    void injectMapImage(imageElement);
  }, [imageElement]);
}
