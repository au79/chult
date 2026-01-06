import { describe, it, expect } from "vitest";
import {
  calculateDistance,
  calculateMidpoint,
  resolveLength,
} from "../public/js/pinchZoomGestures.js";

describe("pinchZoomGestures helpers", () => {
  it("calculates Euclidean distance between two pointers", () => {
    const pointerA = { clientX: 1, clientY: 1 };
    const pointerB = { clientX: 4, clientY: 5 };
    expect(calculateDistance(pointerA, pointerB)).toBe(5);
  });

  it("computes the midpoint when two pointers exist", () => {
    const pointerA = { clientX: 2, clientY: 2 };
    const pointerB = { clientX: 6, clientY: 10 };
    expect(calculateMidpoint(pointerA, pointerB)).toEqual({
      clientX: 4,
      clientY: 6,
    });
  });

  it("resolves numeric and percentage lengths", () => {
    expect(resolveLength(12, 200)).toBe(12);
    expect(resolveLength("50%", 300)).toBe(150);
    expect(resolveLength("25", 100)).toBe(25);
  });
});
