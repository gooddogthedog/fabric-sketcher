/**
 * A row-major 3x3 affine matrix used with column vectors.
 *
 * `multiply(left, right)` composes transforms so `right` is applied first.
 */
export type Matrix3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type Point2D = Readonly<{ x: number; y: number }>;

export function identity(): Matrix3 {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

export function translation(x: number, y: number): Matrix3 {
  return [1, 0, x, 0, 1, y, 0, 0, 1];
}

export function scale(x: number, y: number = x): Matrix3 {
  return [x, 0, 0, 0, y, 0, 0, 0, 1];
}

export function rotation(radians: number): Matrix3 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [cosine, -sine, 0, sine, cosine, 0, 0, 0, 1];
}

export function multiply(left: Matrix3, right: Matrix3): Matrix3 {
  return [
    left[0] * right[0] + left[1] * right[3] + left[2] * right[6],
    left[0] * right[1] + left[1] * right[4] + left[2] * right[7],
    left[0] * right[2] + left[1] * right[5] + left[2] * right[8],
    left[3] * right[0] + left[4] * right[3] + left[5] * right[6],
    left[3] * right[1] + left[4] * right[4] + left[5] * right[7],
    left[3] * right[2] + left[4] * right[5] + left[5] * right[8],
    left[6] * right[0] + left[7] * right[3] + left[8] * right[6],
    left[6] * right[1] + left[7] * right[4] + left[8] * right[7],
    left[6] * right[2] + left[7] * right[5] + left[8] * right[8],
  ];
}

export function transformPoint(matrix: Matrix3, point: Point2D): Point2D {
  return {
    x: matrix[0] * point.x + matrix[1] * point.y + matrix[2],
    y: matrix[3] * point.x + matrix[4] * point.y + matrix[5],
  };
}

export function invert(matrix: Matrix3): Matrix3 {
  const determinant =
    matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7]) -
    matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6]) +
    matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6]);

  if (determinant === 0) {
    throw new RangeError("Cannot invert a singular matrix");
  }

  return [
    (matrix[4] * matrix[8] - matrix[5] * matrix[7]) / determinant,
    (matrix[2] * matrix[7] - matrix[1] * matrix[8]) / determinant,
    (matrix[1] * matrix[5] - matrix[2] * matrix[4]) / determinant,
    (matrix[5] * matrix[6] - matrix[3] * matrix[8]) / determinant,
    (matrix[0] * matrix[8] - matrix[2] * matrix[6]) / determinant,
    (matrix[2] * matrix[3] - matrix[0] * matrix[5]) / determinant,
    (matrix[3] * matrix[7] - matrix[4] * matrix[6]) / determinant,
    (matrix[1] * matrix[6] - matrix[0] * matrix[7]) / determinant,
    (matrix[0] * matrix[4] - matrix[1] * matrix[3]) / determinant,
  ];
}
