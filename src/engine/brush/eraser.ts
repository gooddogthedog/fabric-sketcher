import type {
  BrushSnapshot,
  EraserSnapshot,
} from "../../domain/document/types";

/**
 * The eraser borrows the active brush's tip shape and pressure response. It
 * deliberately carries no colour or texture: erasing removes artwork alpha
 * rather than painting a material.
 */
export function createEraserSnapshot(brush: BrushSnapshot): EraserSnapshot {
  return Object.freeze({
    tipBrushId: brush.id,
    size: brush.size,
    opacity: brush.opacity,
    pressureSize: brush.pressureSize,
    pressureOpacity: brush.pressureOpacity,
    tiltShape: brush.tiltShape,
  });
}
