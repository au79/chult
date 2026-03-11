import type { ViewportState } from './types';

export type StagePoint = {
  x: number;
  y: number;
};

export function stagePointToMapPoint(
  stagePoint: StagePoint,
  viewport: ViewportState,
): StagePoint {
  return {
    x: (stagePoint.x - viewport.x) / viewport.scale,
    y: (stagePoint.y - viewport.y) / viewport.scale,
  };
}

export function mapPointToStagePoint(
  mapPoint: StagePoint,
  viewport: ViewportState,
): StagePoint {
  return {
    x: mapPoint.x * viewport.scale + viewport.x,
    y: mapPoint.y * viewport.scale + viewport.y,
  };
}
