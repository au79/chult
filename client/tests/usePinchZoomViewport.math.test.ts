import { describe, expect, it } from 'vitest';
import { MAP_ASPECT_RATIO } from '../src/map/mapCoordinateSpace';
import { __testables } from '../src/map/usePinchZoomViewport';

describe('usePinchZoomViewport math helpers', () => {
  it('computes centered map frame for wide viewport', () => {
    const element = document.createElement('div');
    element.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 20,
        width: 1000,
        height: 500,
      }) as DOMRect;

    const frame = __testables.getViewportMapFrame(element);

    const expectedMapWidth = 500 * MAP_ASPECT_RATIO;
    expect(frame.viewportLeft).toBe(10);
    expect(frame.viewportTop).toBe(20);
    expect(frame.viewportWidth).toBe(1000);
    expect(frame.viewportHeight).toBe(500);
    expect(frame.mapWidth).toBeCloseTo(expectedMapWidth, 6);
    expect(frame.mapHeight).toBe(500);
    expect(frame.mapLeft).toBeCloseTo((1000 - expectedMapWidth) / 2, 6);
    expect(frame.mapTop).toBe(0);
  });

  it('clamps pan on both axes when exceeding bounds', () => {
    const frame = {
      viewportLeft: 0,
      viewportTop: 0,
      viewportWidth: 1000,
      viewportHeight: 500,
      mapLeft: 100,
      mapTop: 0,
      mapRight: 900,
      mapBottom: 500,
      mapWidth: 800,
      mapHeight: 500,
    };

    const clamped = __testables.clampPanToViewport(
      { x: 500, y: -250 },
      2,
      frame,
    );

    expect(clamped).toEqual({ x: -100, y: -250 });
  });

  it('pins axis to midpoint when coverage is impossible', () => {
    expect(__testables.clampAxis(10, -10, 999)).toBe(0);

    const frame = {
      viewportLeft: 0,
      viewportTop: 0,
      viewportWidth: 1000,
      viewportHeight: 500,
      mapLeft: 100,
      mapTop: 50,
      mapRight: 900,
      mapBottom: 450,
      mapWidth: 800,
      mapHeight: 400,
    };

    const clamped = __testables.clampPanToViewport({ x: 0, y: 0 }, 0.5, frame);
    expect(clamped.x).toBe((frame.viewportWidth / 0.5 - frame.mapRight - frame.mapLeft) / 2);
    expect(clamped.y).toBe((frame.viewportHeight / 0.5 - frame.mapBottom - frame.mapTop) / 2);
  });
});
