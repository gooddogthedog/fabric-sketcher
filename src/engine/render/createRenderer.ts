import { Canvas2DRenderer } from "./Canvas2DRenderer";
import type { Renderer } from "./Renderer";
import { WebGL2Renderer, type WebGLRendererStatus } from "./WebGL2Renderer";

export type RendererStatus = WebGLRendererStatus;

export type RendererFallbackReason = Readonly<{
  code:
    | "webgl2-context-unavailable"
    | "webgl2-context-creation-failed"
    | "webgl2-initialization-failed";
  message: string;
}>;

export type RendererSelection = Readonly<{
  renderer: Renderer;
  /**
   * The canvas currently owned by `renderer`. This can differ from the input
   * canvas after WebGL initialization acquired it and then failed. Consumers
   * must mount and retain this returned surface.
   */
  surface: HTMLCanvasElement;
  fallbackReason: RendererFallbackReason | null;
}>;

export type CompatibilitySurface = Readonly<{
  surface: HTMLCanvasElement;
  context: CanvasRenderingContext2D | null;
}>;

export type CreateRendererOptions = Readonly<{
  getWebGL2Context?: () => WebGL2RenderingContext | null;
  getCanvas2DContext?: () => CanvasRenderingContext2D | null;
  /**
   * Creates a candidate Canvas 2D surface. After WebGL acquisition this must
   * return a surface distinct from `source`; returning a null context or the
   * acquired source produces `RendererInitializationError`.
   */
  createCompatibilitySurface?: (
    source: HTMLCanvasElement,
  ) => CompatibilitySurface;
  onStatus?: (status: RendererStatus) => void;
}>;

export class RendererInitializationError extends Error {
  public override readonly name = "RendererInitializationError";
  public readonly code = "canvas2d-context-unavailable";

  public constructor(
    public readonly fallbackReason: RendererFallbackReason,
    cause?: unknown,
  ) {
    super(
      `Canvas 2D compatibility initialization failed after ${fallbackReason.message}`,
      { cause },
    );
  }
}

/**
 * Creates a renderer and returns its active canvas. Task 10 and other callers
 * must mount/use `selection.surface`, because an acquired WebGL canvas cannot
 * be reused for Canvas 2D if shader or program initialization later fails.
 */
export function createRenderer(
  canvas: HTMLCanvasElement,
  options: CreateRendererOptions = {},
): RendererSelection {
  const getWebGL2Context =
    options.getWebGL2Context ??
    (() =>
      canvas.getContext("webgl2", {
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
      }));
  const getCanvas2DContext =
    options.getCanvas2DContext ?? (() => canvas.getContext("2d"));
  const createCompatibilitySurface =
    options.createCompatibilitySurface ?? createStructuralCloneSurface;

  let context: WebGL2RenderingContext | null;
  try {
    context = getWebGL2Context();
  } catch (error) {
    return compatibilitySelection(
      canvas,
      getCanvas2DContext,
      createCompatibilitySurface,
      {
        code: "webgl2-context-creation-failed",
        message: `WebGL2 context creation failed: ${errorMessage(error)}`,
      },
      false,
    );
  }

  if (context === null) {
    return compatibilitySelection(
      canvas,
      getCanvas2DContext,
      createCompatibilitySurface,
      {
        code: "webgl2-context-unavailable",
        message:
          "WebGL2 is unavailable; Canvas 2D compatibility rendering is active.",
      },
      false,
    );
  }

  try {
    return {
      renderer: new WebGL2Renderer(canvas, context, {
        getContext: getWebGL2Context,
        onStatus: options.onStatus,
      }),
      surface: canvas,
      fallbackReason: null,
    };
  } catch (error) {
    return compatibilitySelection(
      canvas,
      getCanvas2DContext,
      createCompatibilitySurface,
      {
        code: "webgl2-initialization-failed",
        message: `WebGL2 renderer initialization failed: ${errorMessage(error)}`,
      },
      true,
      error,
    );
  }
}

function compatibilitySelection(
  canvas: HTMLCanvasElement,
  getOriginalContext: () => CanvasRenderingContext2D | null,
  createFreshSurface: (source: HTMLCanvasElement) => CompatibilitySurface,
  reason: RendererFallbackReason,
  freshSurfaceRequired: boolean,
  cause?: unknown,
): RendererSelection {
  if (!freshSurfaceRequired) {
    try {
      const context = getOriginalContext();
      if (context !== null) {
        return createCompatibilitySelection(canvas, context, reason);
      }
    } catch (error) {
      cause = error;
    }
  }

  let compatibilitySurface: CompatibilitySurface;
  try {
    compatibilitySurface = createFreshSurface(canvas);
  } catch (error) {
    throw new RendererInitializationError(reason, error);
  }
  if (
    compatibilitySurface.context === null ||
    (freshSurfaceRequired && compatibilitySurface.surface === canvas)
  ) {
    throw new RendererInitializationError(reason, cause);
  }

  if (compatibilitySurface.surface !== canvas) {
    canvas.replaceWith(compatibilitySurface.surface);
  }
  return createCompatibilitySelection(
    compatibilitySurface.surface,
    compatibilitySurface.context,
    reason,
  );
}

function createCompatibilitySelection(
  surface: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  reason: RendererFallbackReason,
): RendererSelection {
  return {
    renderer: new Canvas2DRenderer(surface, context),
    surface,
    fallbackReason: Object.freeze(reason),
  };
}

function createStructuralCloneSurface(
  source: HTMLCanvasElement,
): CompatibilitySurface {
  const surface = source.cloneNode(false) as HTMLCanvasElement;
  return { surface, context: surface.getContext("2d") };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
