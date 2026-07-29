import type { BrushSnapshot, HexColor } from "../../domain/document/types";
import { getBrushPreset } from "./presets";

export const MIN_BRUSH_SIZE = 2;
export const MAX_BRUSH_SIZE = 240;
export const MIN_BRUSH_OPACITY = 0.05;
export const MAX_BRUSH_OPACITY = 1;
export const RECENT_COLOR_LIMIT = 5;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export class BrushColorError extends Error {
  constructor(value: string) {
    super(`Expected a six-digit hex color, received ${value}.`);
    this.name = "BrushColorError";
  }
}

export function setBrushSize(
  brush: BrushSnapshot,
  size: number,
): BrushSnapshot {
  return immutableBrush({
    ...brush,
    size: clamp(size, MIN_BRUSH_SIZE, MAX_BRUSH_SIZE, brush.size),
  });
}

export function setBrushOpacity(
  brush: BrushSnapshot,
  opacity: number,
): BrushSnapshot {
  return immutableBrush({
    ...brush,
    opacity: clamp(
      opacity,
      MIN_BRUSH_OPACITY,
      MAX_BRUSH_OPACITY,
      brush.opacity,
    ),
  });
}

export function setBrushColor(
  brush: BrushSnapshot,
  color: string,
): BrushSnapshot {
  if (!HEX_COLOR.test(color)) {
    throw new BrushColorError(color);
  }
  return immutableBrush({ ...brush, color: color.toLowerCase() as HexColor });
}

export function resetBrushToPreset(brush: BrushSnapshot): BrushSnapshot {
  return getBrushPreset(brush.id);
}

export function addRecentColor(
  colors: readonly HexColor[],
  color: HexColor,
): readonly HexColor[] {
  const normalized = color.toLowerCase() as HexColor;
  return Object.freeze(
    [normalized, ...colors.filter((entry) => entry !== normalized)].slice(
      0,
      RECENT_COLOR_LIMIT,
    ),
  );
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, value));
}

function immutableBrush(brush: BrushSnapshot): BrushSnapshot {
  return Object.freeze({
    ...brush,
    texture: Object.freeze({ ...brush.texture }),
  });
}
