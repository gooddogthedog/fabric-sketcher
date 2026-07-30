import type { Matrix3 } from "../math/affine";
import type { BrushTextureKind } from "../../domain/document/types";

/**
 * A normalized, unpremultiplied RGBA tuple. Renderers multiply RGB by the
 * effective alpha before compositing with premultiplied-alpha blend factors.
 */
export type RenderColor = readonly [
  red: number,
  green: number,
  blue: number,
  alpha: number,
];

export type RenderTexture = Readonly<{
  kind: BrushTextureKind;
  scale: number;
  strength: number;
  angle: number;
  scatter: number;
}>;

export type RenderComposite = "paint" | "erase";

export type RenderStroke = Readonly<{
  operationId: string;
  /** Interleaved `(x, y, alpha)` vertices forming one triangle strip. */
  mesh: Float32Array;
  color: RenderColor;
  texture: RenderTexture;
  /** `erase` removes artwork alpha instead of painting material. */
  composite: RenderComposite;
}>;

export interface Renderer {
  readonly kind: "webgl2" | "canvas2d-compat";
  resize(
    pixelWidth: number,
    pixelHeight: number,
    devicePixelRatio: number,
  ): void;
  setViewport(matrix: Matrix3): void;
  replaceDocument(strokes: readonly RenderStroke[]): void;
  previewStroke(
    confirmed: RenderStroke | null,
    predicted: RenderStroke | null,
  ): void;
  commitStroke(stroke: RenderStroke): void;
  clearPreview(): void;
  render(now: number): void;
  dispose(): void;
}
