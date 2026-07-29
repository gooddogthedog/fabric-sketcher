import type { BrushTextureKind } from "../../domain/document/types";
import type { RenderTexture } from "./Renderer";

export type TextureUniforms = Readonly<{
  kind: number;
  scale: number;
  strength: number;
  angleRadians: number;
  scatter: number;
}>;

const KIND_CODES: Readonly<Record<BrushTextureKind, number>> = {
  graphite: 0,
  silk: 1,
  denim: 2,
  wool: 3,
  knit: 4,
};

const MINIMUM_SCALE = 0.001;
const MAXIMUM_SCALE = 4096;
const DEGREES_TO_RADIANS = Math.PI / 180;

export function textureUniforms(texture: RenderTexture): TextureUniforms {
  const angle = finiteOr(texture.angle, 0);
  const normalizedAngle = ((((angle + 180) % 360) + 360) % 360) - 180;

  return {
    kind: KIND_CODES[texture.kind],
    scale: clamp(finiteOr(texture.scale, 1), MINIMUM_SCALE, MAXIMUM_SCALE),
    strength: clamp(finiteOr(texture.strength, 0), 0, 1),
    angleRadians: normalizedAngle * DEGREES_TO_RADIANS,
    scatter: clamp(finiteOr(texture.scatter, 0), 0, 1),
  };
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
