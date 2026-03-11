import { describe, expect, it } from 'vitest';
import {
  mapPointToStagePoint,
  stagePointToMapPoint,
} from '../src/map/coordinateTransforms';

describe('coordinate transforms', () => {
  it('converts between stage and map points', () => {
    const viewport = { x: 100, y: 200, scale: 2 };
    const stagePoint = { x: 300, y: 500 };

    const mapPoint = stagePointToMapPoint(stagePoint, viewport);
    expect(mapPoint).toEqual({ x: 100, y: 150 });
    expect(mapPointToStagePoint(mapPoint, viewport)).toEqual(stagePoint);
  });
});
