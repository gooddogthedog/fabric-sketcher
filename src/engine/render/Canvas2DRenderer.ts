import { identity, type Matrix3 } from "../math/affine";
import type { Renderer, RenderStroke } from "./Renderer";

const VERTEX_STRIDE = 3;

export class Canvas2DRenderer implements Renderer {
  public readonly kind = "canvas2d-compat";

  private readonly strokes = new Map<string, RenderStroke>();
  private viewportMatrix: Matrix3 = identity();
  private confirmedPreview: RenderStroke | null = null;
  private predictedPreview: RenderStroke | null = null;
  private devicePixelRatio = 1;
  private disposed = false;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly context: CanvasRenderingContext2D,
  ) {}

  public resize(
    pixelWidth: number,
    pixelHeight: number,
    devicePixelRatio: number,
  ): void {
    if (this.disposed) {
      return;
    }

    this.devicePixelRatio = positiveOrOne(devicePixelRatio);
    this.canvas.width = Math.max(
      1,
      Math.round(Math.max(0, pixelWidth) * this.devicePixelRatio),
    );
    this.canvas.height = Math.max(
      1,
      Math.round(Math.max(0, pixelHeight) * this.devicePixelRatio),
    );
  }

  public setViewport(matrix: Matrix3): void {
    this.viewportMatrix = matrix;
  }

  public replaceDocument(strokes: readonly RenderStroke[]): void {
    if (this.disposed) {
      return;
    }

    this.strokes.clear();
    for (const stroke of strokes) {
      this.strokes.set(stroke.operationId, stroke);
    }
  }

  public previewStroke(
    confirmed: RenderStroke | null,
    predicted: RenderStroke | null,
  ): void {
    if (this.disposed) {
      return;
    }

    this.confirmedPreview = confirmed;
    this.predictedPreview = predicted;
  }

  public commitStroke(stroke: RenderStroke): void {
    if (!this.disposed) {
      this.strokes.set(stroke.operationId, stroke);
    }
  }

  public clearPreview(): void {
    this.confirmedPreview = null;
    this.predictedPreview = null;
  }

  public render(now: number): void {
    void now;
    if (this.disposed) {
      return;
    }

    const context = this.context;
    const matrix = this.viewportMatrix;
    const ratio = this.devicePixelRatio;

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.setTransform(
      ratio * matrix[0],
      ratio * matrix[3],
      ratio * matrix[1],
      ratio * matrix[4],
      ratio * matrix[2],
      ratio * matrix[5],
    );

    for (const stroke of this.strokes.values()) {
      drawStroke(context, stroke);
    }
    if (this.confirmedPreview !== null) {
      drawStroke(context, this.confirmedPreview);
    }
    if (this.predictedPreview !== null) {
      drawStroke(context, this.predictedPreview);
    }
    context.restore();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.strokes.clear();
    this.clearPreview();
  }
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: RenderStroke,
): void {
  const vertexCount = Math.floor(stroke.mesh.length / VERTEX_STRIDE);
  const pairedVertexCount = vertexCount - (vertexCount % 2);
  if (pairedVertexCount < 4) {
    return;
  }

  const [red, green, blue, colorAlpha] = stroke.color;
  context.fillStyle = `rgb(${toByte(red)} ${toByte(green)} ${toByte(blue)})`;
  for (
    let firstVertex = 0;
    firstVertex + 3 < pairedVertexCount;
    firstVertex += 2
  ) {
    const firstLeft = firstVertex * VERTEX_STRIDE;
    const firstRight = (firstVertex + 1) * VERTEX_STRIDE;
    const secondLeft = (firstVertex + 2) * VERTEX_STRIDE;
    const secondRight = (firstVertex + 3) * VERTEX_STRIDE;
    context.globalAlpha =
      clamp01(colorAlpha) *
      segmentAlpha(stroke.mesh, firstLeft, firstRight, secondLeft, secondRight);
    context.beginPath();
    context.moveTo(stroke.mesh[firstLeft]!, stroke.mesh[firstLeft + 1]!);
    context.lineTo(stroke.mesh[secondLeft]!, stroke.mesh[secondLeft + 1]!);
    context.lineTo(stroke.mesh[secondRight]!, stroke.mesh[secondRight + 1]!);
    context.lineTo(stroke.mesh[firstRight]!, stroke.mesh[firstRight + 1]!);
    context.closePath();
    context.fill();
  }
}

function segmentAlpha(
  mesh: Float32Array,
  firstLeft: number,
  firstRight: number,
  secondLeft: number,
  secondRight: number,
): number {
  return (
    (clamp01(mesh[firstLeft + 2]!) +
      clamp01(mesh[firstRight + 2]!) +
      clamp01(mesh[secondLeft + 2]!) +
      clamp01(mesh[secondRight + 2]!)) /
    4
  );
}

function toByte(value: number): number {
  return Math.round(clamp01(value) * 255);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function positiveOrOne(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}
