import { describe, expect, it } from "vitest";
import {
  identity,
  invert,
  multiply,
  rotation,
  scale,
  transformPoint,
  translation,
} from "./affine";

describe("affine matrices", () => {
  it("applies identity, translation, scale, and rotation with column-vector composition", () => {
    const point = { x: 3, y: 4 };
    const transform = multiply(
      translation(10, -5),
      multiply(rotation(Math.PI / 2), scale(2, 3)),
    );

    expect(transformPoint(identity(), point)).toEqual(point);
    const transformed = transformPoint(transform, point);
    expect(transformed.x).toBeCloseTo(-2, 12);
    expect(transformed.y).toBeCloseTo(1, 12);
  });

  it("round-trips an affine transform through its inverse within 1e-8", () => {
    const matrix = multiply(
      translation(42.5, -19.25),
      multiply(rotation(0.37), scale(2.25, 0.75)),
    );
    const point = { x: -83.125, y: 14.75 };

    const roundTrip = transformPoint(
      invert(matrix),
      transformPoint(matrix, point),
    );

    expect(roundTrip.x).toBeCloseTo(point.x, 8);
    expect(roundTrip.y).toBeCloseTo(point.y, 8);
  });

  it("explicitly rejects singular matrices", () => {
    expect(() => invert(scale(0, 1))).toThrowError(
      new RangeError("Cannot invert a singular matrix"),
    );
  });

  it("inverts a small but nonsingular affine scale", () => {
    const matrix = scale(1e-9);
    const point = { x: 4, y: -7 };

    const roundTrip = transformPoint(
      invert(matrix),
      transformPoint(matrix, point),
    );

    expect(roundTrip.x).toBeCloseTo(point.x, 8);
    expect(roundTrip.y).toBeCloseTo(point.y, 8);
  });

  it("keeps a transform centroid stable", () => {
    const centroid = { x: 125.5, y: -42.25 };
    const aroundCentroid = multiply(
      translation(centroid.x, centroid.y),
      multiply(
        rotation(Math.PI / 3),
        multiply(scale(4), translation(-centroid.x, -centroid.y)),
      ),
    );

    const transformed = transformPoint(aroundCentroid, centroid);

    expect(transformed.x).toBeCloseTo(centroid.x, 12);
    expect(transformed.y).toBeCloseTo(centroid.y, 12);
  });
});
