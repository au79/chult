import { describe, expect, it } from 'vitest';
import { mapHexPolygonPoints } from '../src/map/mapHexPolygonPoints';

function polygonSignature(pointsList: readonly (readonly number[])[]) {
  let hash = 2166136261;
  for (const polygon of pointsList) {
    for (const point of polygon) {
      const encoded = Number(point).toFixed(1);
      for (let index = 0; index < encoded.length; index += 1) {
        hash ^= encoded.charCodeAt(index);
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      hash ^= 44; // comma separator
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    hash ^= 10;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

describe('map polygon guard', () => {
  it('keeps polygon count and order stable', () => {
    expect(mapHexPolygonPoints.length).toBe(949);
    expect(mapHexPolygonPoints[0]).toEqual([
      1192.1, 3165.3, 1153.8, 3165.3, 1134.6, 3198.6, 1153.8, 3232, 1192.1,
      3232, 1211.3, 3198.6,
    ]);
    expect(
      mapHexPolygonPoints[Math.floor(mapHexPolygonPoints.length / 2)],
    ).toEqual([
      2342.6, 3298.8, 2304.3, 3298.8, 2285.1, 3332.2, 2304.3, 3365.6, 2342.6,
      3365.6, 2361.8, 3332.2,
    ]);
    expect(mapHexPolygonPoints[mapHexPolygonPoints.length - 1]).toEqual([
      4068.4, 4033.2, 4030, 4033.2, 4010.8, 4066.6, 4030, 4100, 4068.4, 4100,
      4087.5, 4066.6,
    ]);
    expect(polygonSignature(mapHexPolygonPoints)).toBe(969781357);
  });
});
