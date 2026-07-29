import type { PenSample } from "../../domain/document/types";

/** Each vertex is stored as three consecutive floats in `(x, y, alpha)` order. */
export const STROKE_VERTEX_STRIDE = 3;

export type StrokeVertex = Readonly<{ x: number; y: number; alpha: number }>;

/** The only brush fields stroke geometry depends on. */
export type StrokeGeometry = Readonly<{
  size: number;
  opacity: number;
  pressureSize: number;
  pressureOpacity: number;
  tiltShape: number;
}>;

export function buildStrokeMesh(
  samples: readonly PenSample[],
  brush: StrokeGeometry,
): Float32Array {
  if (samples.length < 2) {
    return new Float32Array();
  }

  const mesh = new Float32Array(samples.length * 2 * STROKE_VERTEX_STRIDE);
  const pressureSize = clamp01(brush.pressureSize);
  const pressureOpacity = clamp01(brush.pressureOpacity);
  const tiltShape = clamp01(brush.tiltShape);
  const positionsX = new Float64Array(samples.length);
  const positionsY = new Float64Array(samples.length);
  const prefixX = new Float64Array(samples.length + 1);
  const prefixY = new Float64Array(samples.length + 1);

  for (let index = 0; index < samples.length; index += 1) {
    prefixX[index + 1] = prefixX[index]! + samples[index]!.x;
    prefixY[index + 1] = prefixY[index]! + samples[index]!.y;
  }

  for (let index = 0; index < samples.length; index += 1) {
    const radius = Math.min(2, index, samples.length - 1 - index);
    const start = index - radius;
    const end = index + radius + 1;
    const count = end - start;
    positionsX[index] = (prefixX[end]! - prefixX[start]!) / count;
    positionsY[index] = (prefixY[end]! - prefixY[start]!) / count;
  }

  const previousDistinct = new Int32Array(samples.length).fill(-1);
  const nextDistinct = new Int32Array(samples.length).fill(-1);
  let neighbor = -1;

  for (let index = 1; index < samples.length; index += 1) {
    if (!samePosition(positionsX, positionsY, index, index - 1)) {
      neighbor = index - 1;
    }
    previousDistinct[index] = neighbor;
  }

  neighbor = -1;
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    if (!samePosition(positionsX, positionsY, index, index + 1)) {
      neighbor = index + 1;
    }
    nextDistinct[index] = neighbor;
  }

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!;
    const previousIndex = previousDistinct[index]!;
    const nextIndex = nextDistinct[index]!;
    const previousX =
      previousIndex < 0 ? positionsX[index]! : positionsX[previousIndex]!;
    const previousY =
      previousIndex < 0 ? positionsY[index]! : positionsY[previousIndex]!;
    const nextX = nextIndex < 0 ? positionsX[index]! : positionsX[nextIndex]!;
    const nextY = nextIndex < 0 ? positionsY[index]! : positionsY[nextIndex]!;
    const tangentX = nextX - previousX;
    const tangentY = nextY - previousY;
    const tangentLength = Math.hypot(tangentX, tangentY);
    const normalX = tangentLength === 0 ? 0 : -tangentY / tangentLength;
    const normalY = tangentLength === 0 ? 1 : tangentX / tangentLength;
    const diameter =
      Math.max(0, brush.size) *
      (1 - pressureSize + pressureSize * clamp01(sample.pressure));
    const radius = diameter / 2;
    const tiltX = finiteOrZero(sample.tiltX);
    const tiltY = finiteOrZero(sample.tiltY);
    const tiltLength = Math.hypot(tiltX, tiltY);
    const tiltMagnitude = Math.min(1, tiltLength / 90);
    const tiltExtent = radius * tiltShape * tiltMagnitude;
    const tiltAxisX = tiltLength === 0 ? 0 : tiltX / tiltLength;
    const tiltAxisY = tiltLength === 0 ? 0 : tiltY / tiltLength;
    const tiltDirection = Math.sign(normalX * tiltAxisX + normalY * tiltAxisY);
    const nibX = normalX * radius + tiltAxisX * tiltExtent * tiltDirection;
    const nibY = normalY * radius + tiltAxisY * tiltExtent * tiltDirection;
    const alpha =
      clamp01(brush.opacity) *
      (1 - pressureOpacity + pressureOpacity * clamp01(sample.pressure));
    const offset = index * 2 * STROKE_VERTEX_STRIDE;

    mesh[offset] = positionsX[index]! + nibX;
    mesh[offset + 1] = positionsY[index]! + nibY;
    mesh[offset + 2] = alpha;
    mesh[offset + 3] = positionsX[index]! - nibX;
    mesh[offset + 4] = positionsY[index]! - nibY;
    mesh[offset + 5] = alpha;
  }

  return mesh;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function samePosition(
  positionsX: Float64Array,
  positionsY: Float64Array,
  left: number,
  right: number,
): boolean {
  return (
    positionsX[left] === positionsX[right] &&
    positionsY[left] === positionsY[right]
  );
}
