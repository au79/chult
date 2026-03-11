import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { mapHexPolygonPoints } from '../map/mapHexPolygonPoints';
import { useMapImage } from '../map/useMapImage';
import { usePinchZoomViewport } from '../map/usePinchZoomViewport';
import type { MapRole, ViewportState } from '../map/types';
import { OverlayLayer } from './OverlayLayer';

type MapStageProps = {
  role: MapRole;
  revealedHexIds: ReadonlySet<string>;
  hexOpacityPercent: number;
  onToggleHex: (hexId: string) => void;
  onViewportChange: (viewport: ViewportState) => void;
};

export function MapStage({
  role,
  revealedHexIds,
  hexOpacityPercent,
  onToggleHex,
  onViewportChange,
}: MapStageProps) {
  const [containerElement, setContainerElement] = useState<HTMLElement | null>(
    null,
  );
  const [canvasElement, setCanvasElement] = useState<HTMLElement | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(
    null,
  );

  usePinchZoomViewport(canvasElement, containerElement, onViewportChange);
  useMapImage(imageElement);

  const setContainerRef = useCallback((element: HTMLDivElement | null) => {
    setContainerElement(element);
  }, []);

  const setCanvasRef = useCallback((element: HTMLDivElement | null) => {
    setCanvasElement(element);
  }, []);

  const setImageRef = useCallback((element: HTMLImageElement | null) => {
    setImageElement(element);
  }, []);

  const stageStyle = useMemo(
    () => ({
      '--hex-opacity': String(hexOpacityPercent / 100),
    }),
    [hexOpacityPercent],
  );

  return (
    <section className="map-stage" style={stageStyle as CSSProperties}>
      <div ref={setContainerRef} className="pinch-zoom-root">
        <div ref={setCanvasRef} className="map-canvas">
          <img
            ref={setImageRef}
            className="map-background"
            alt=""
            data-map-image=""
          />
          <svg
            className="map map-overlay"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 4476 6000"
            preserveAspectRatio="xMidYMid meet"
          >
            {mapHexPolygonPoints.map((points, index) => {
              const hexId = String(index);
              const isRevealed = revealedHexIds.has(hexId);
              const polygonClassName = ['st0', isRevealed ? 'off' : '']
                .filter(Boolean)
                .join(' ');
              const svgPoints = points
                .map((value, pointIndex) =>
                  pointIndex % 2 === 0 ? `${value},` : `${value} `,
                )
                .join('')
                .trim();

              return (
                <polygon
                  key={hexId}
                  id={hexId}
                  data-hex-id={hexId}
                  className={polygonClassName}
                  points={svgPoints}
                  onClick={() => onToggleHex(hexId)}
                  style={
                    role === 'player' ? { pointerEvents: 'none' } : undefined
                  }
                />
              );
            })}
          </svg>
        </div>
      </div>
      <OverlayLayer />
    </section>
  );
}
