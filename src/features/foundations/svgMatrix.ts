import type { Matrix3 } from "../../engine/math/affine";

export function svgMatrix(matrix: Matrix3): string {
  return `matrix(${matrix[0]} ${matrix[3]} ${matrix[1]} ${matrix[4]} ${matrix[2]} ${matrix[5]})`;
}
