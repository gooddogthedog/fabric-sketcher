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
  fallbackReason: RendererFallbackReason | null;
}>;

export type CreateRendererOptions = Readonly<{
  getWebGL2Context?: () => WebGL2RenderingContext | null;
  getCanvas2DContext?: () => CanvasRenderingContext2D | null;
  onStatus?: (status: RendererStatus) => void;
}>;

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

  let context: WebGL2RenderingContext | null;
  try {
    context = getWebGL2Context();
  } catch (error) {
    return compatibilitySelection(canvas, getCanvas2DContext, {
      code: "webgl2-context-creation-failed",
      message: `WebGL2 context creation failed: ${errorMessage(error)}`,
    });
  }

  if (context === null) {
    return compatibilitySelection(canvas, getCanvas2DContext, {
      code: "webgl2-context-unavailable",
      message:
        "WebGL2 is unavailable; Canvas 2D compatibility rendering is active.",
    });
  }

  try {
    return {
      renderer: new WebGL2Renderer(canvas, context, {
        getContext: getWebGL2Context,
        onStatus: options.onStatus,
      }),
      fallbackReason: null,
    };
  } catch (error) {
    return compatibilitySelection(canvas, getCanvas2DContext, {
      code: "webgl2-initialization-failed",
      message: `WebGL2 renderer initialization failed: ${errorMessage(error)}`,
    });
  }
}

function compatibilitySelection(
  canvas: HTMLCanvasElement,
  getContext: () => CanvasRenderingContext2D | null,
  reason: RendererFallbackReason,
): RendererSelection {
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = getContext();
  } catch {
    // The explicit adapter and WebGL diagnostic remain inspectable even when
    // the browser cannot create a Canvas 2D context either.
  }
  return {
    renderer: new Canvas2DRenderer(canvas, context),
    fallbackReason: Object.freeze(reason),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
