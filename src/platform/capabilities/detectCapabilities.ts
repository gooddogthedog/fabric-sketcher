import type { CapabilityEnvironment, CapabilityProfile } from "./types";

type WebGLLoseContextExtension = Readonly<{
  loseContext: () => void;
}>;

export async function detectCapabilities(
  environment: CapabilityEnvironment,
): Promise<CapabilityProfile> {
  let context: WebGL2RenderingContext | null;

  try {
    context = environment.createWebGL2Context?.() ?? null;
  } catch {
    context = null;
  }

  const webgl2 = context !== null;
  const pointerEvents = environment.PointerEvent !== undefined;
  const coalescedEvents =
    typeof environment.PointerEvent?.prototype?.getCoalescedEvents ===
    "function";
  const predictedEvents =
    typeof environment.PointerEvent?.prototype?.getPredictedEvents ===
    "function";
  const persistentStorage = environment.storage?.persist
    ? await environment.storage.persist().catch(() => false)
    : false;
  const opfs = environment.storage?.getDirectory !== undefined;
  let maxTextureSize: number | null = null;

  if (context) {
    try {
      const maximum = context.getParameter(context.MAX_TEXTURE_SIZE);
      maxTextureSize = typeof maximum === "number" ? maximum : null;
    } catch {
      maxTextureSize = null;
    } finally {
      try {
        const loseContext = context.getExtension(
          "WEBGL_lose_context",
        ) as WebGLLoseContextExtension | null;
        loseContext?.loseContext();
      } catch {
        // Context cleanup is best effort.
      }
    }
  }

  return Object.freeze({
    pointerEvents,
    coalescedEvents,
    predictedEvents,
    webgl2,
    offscreenCanvas: environment.OffscreenCanvas !== undefined,
    opfs,
    persistentStorage,
    maxTextureSize,
    rendererTier:
      webgl2 && environment.OffscreenCanvas !== undefined
        ? "webgl2-worker"
        : webgl2
          ? "webgl2-main"
          : "canvas2d-compat",
  });
}
