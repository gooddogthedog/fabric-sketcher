import { describe, expect, it } from "vitest";
import { svgMatrix } from "./svgMatrix";

describe("svgMatrix", () => {
  it("maps the row-major affine matrix into SVG order", () => {
    expect(svgMatrix([2, 0, 40, 0, 3, 50, 0, 0, 1])).toBe(
      "matrix(2 0 0 3 40 50)",
    );
  });

  it("preserves shear and rotation coefficients", () => {
    expect(svgMatrix([1, -2, 30, 4, 5, -60, 0, 0, 1])).toBe(
      "matrix(1 4 -2 5 30 -60)",
    );
  });
});
