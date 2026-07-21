export type CapabilityProfile = Readonly<{
  pointerEvents: boolean;
  coalescedEvents: boolean;
  predictedEvents: boolean;
  webgl2: boolean;
  offscreenCanvas: boolean;
  opfs: boolean;
  persistentStorage: boolean;
  maxTextureSize: number | null;
  rendererTier: "webgl2-worker" | "webgl2-main" | "canvas2d-compat";
}>;

export type CapabilityEnvironment = Readonly<{
  PointerEvent?: Readonly<{
    prototype?: Readonly<{
      getCoalescedEvents?: unknown;
      getPredictedEvents?: unknown;
    }>;
  }>;
  OffscreenCanvas?: unknown;
  createWebGL2Context?: () => WebGL2RenderingContext | null;
  storage?: Readonly<{
    getDirectory?: () => Promise<unknown>;
    persist?: () => Promise<boolean>;
  }>;
}>;
