import { describe, expect, it } from "vitest";
import { detectCapabilities } from "./detectCapabilities";
import type { CapabilityEnvironment } from "./types";

function createWebGL2Context(maxTextureSize = 8192): WebGL2RenderingContext {
  return {
    MAX_TEXTURE_SIZE: 0x0d33,
    getParameter: (parameter: number) =>
      parameter === 0x0d33 ? maxTextureSize : null,
    getExtension: () => null,
  } as unknown as WebGL2RenderingContext;
}

describe("detectCapabilities", () => {
  it("selects the worker WebGL2 tier when WebGL2 and OffscreenCanvas are available", async () => {
    const environment: CapabilityEnvironment = {
      PointerEvent: { prototype: {} },
      OffscreenCanvas: class {},
      createWebGL2Context: () => createWebGL2Context(),
      storage: {},
    };

    await expect(detectCapabilities(environment)).resolves.toMatchObject({
      webgl2: true,
      offscreenCanvas: true,
      maxTextureSize: 8192,
      rendererTier: "webgl2-worker",
    });
  });

  it("selects the main-thread WebGL2 tier when OffscreenCanvas is unavailable", async () => {
    const environment: CapabilityEnvironment = {
      createWebGL2Context: () => createWebGL2Context(),
    };

    await expect(detectCapabilities(environment)).resolves.toMatchObject({
      webgl2: true,
      offscreenCanvas: false,
      rendererTier: "webgl2-main",
    });
  });

  it("selects the Canvas 2D compatibility tier when WebGL2 cannot be created", async () => {
    const environment: CapabilityEnvironment = {
      OffscreenCanvas: class {},
      createWebGL2Context: () => null,
    };

    await expect(detectCapabilities(environment)).resolves.toMatchObject({
      webgl2: false,
      maxTextureSize: null,
      rendererTier: "canvas2d-compat",
    });
  });

  it("detects coalesced pointer events without inferring predicted events", async () => {
    const environment: CapabilityEnvironment = {
      PointerEvent: {
        prototype: {
          getCoalescedEvents: () => [],
        },
      },
    };

    await expect(detectCapabilities(environment)).resolves.toMatchObject({
      pointerEvents: true,
      coalescedEvents: true,
      predictedEvents: false,
    });
  });

  it("detects predicted pointer events without inferring coalesced events", async () => {
    const environment: CapabilityEnvironment = {
      PointerEvent: {
        prototype: {
          getPredictedEvents: () => [],
        },
      },
    };

    await expect(detectCapabilities(environment)).resolves.toMatchObject({
      pointerEvents: true,
      coalescedEvents: false,
      predictedEvents: true,
    });
  });

  it("reports rejected persistent storage requests as unavailable", async () => {
    let persistRequests = 0;
    const environment: CapabilityEnvironment = {
      storage: {
        persist: async () => {
          persistRequests += 1;
          throw new Error("permission denied");
        },
      },
    };

    await expect(detectCapabilities(environment)).resolves.toMatchObject({
      persistentStorage: false,
    });
    expect(persistRequests).toBe(1);
  });

  it("detects OPFS from the injected StorageManager getDirectory method", async () => {
    const environment: CapabilityEnvironment = {
      storage: {
        getDirectory: async () => ({}),
      },
    };

    await expect(detectCapabilities(environment)).resolves.toMatchObject({
      opfs: true,
    });
  });

  it("reads MAX_TEXTURE_SIZE only from a created WebGL2 context and releases it", async () => {
    let getParameterCalls = 0;
    let releasedContexts = 0;
    const environment: CapabilityEnvironment = {
      createWebGL2Context: () =>
        ({
          MAX_TEXTURE_SIZE: 0x0d33,
          getParameter: (parameter: number) => {
            getParameterCalls += 1;
            return parameter === 0x0d33 ? 4096 : null;
          },
          getExtension: (name: string) =>
            name === "WEBGL_lose_context"
              ? { loseContext: () => (releasedContexts += 1) }
              : null,
        }) as unknown as WebGL2RenderingContext,
    };

    await expect(detectCapabilities(environment)).resolves.toMatchObject({
      webgl2: true,
      maxTextureSize: 4096,
    });
    expect(getParameterCalls).toBe(1);
    expect(releasedContexts).toBe(1);
  });

  it("continues detecting independent features when a texture query fails", async () => {
    const environment: CapabilityEnvironment = {
      createWebGL2Context: () =>
        ({
          MAX_TEXTURE_SIZE: 0x0d33,
          getParameter: () => {
            throw new Error("query failed");
          },
          getExtension: () => null,
        }) as unknown as WebGL2RenderingContext,
      storage: {
        persist: async () => true,
      },
    };

    await expect(detectCapabilities(environment)).resolves.toMatchObject({
      webgl2: true,
      maxTextureSize: null,
      persistentStorage: true,
    });
  });

  it("returns a frozen capability profile", async () => {
    const profile = await detectCapabilities({});

    expect(Object.isFrozen(profile)).toBe(true);
  });

  it("continues detecting independent features when WebGL2 creation throws", async () => {
    const environment: CapabilityEnvironment = {
      createWebGL2Context: () => {
        throw new Error("context creation failed");
      },
      storage: {
        persist: async () => true,
      },
    };

    await expect(detectCapabilities(environment)).resolves.toMatchObject({
      webgl2: false,
      maxTextureSize: null,
      persistentStorage: true,
    });
  });

  it("does not let a context-release failure block capability detection", async () => {
    const environment: CapabilityEnvironment = {
      createWebGL2Context: () =>
        ({
          MAX_TEXTURE_SIZE: 0x0d33,
          getParameter: () => 4096,
          getExtension: () => {
            throw new Error("release unavailable");
          },
        }) as unknown as WebGL2RenderingContext,
      storage: {
        persist: async () => true,
      },
    };

    await expect(detectCapabilities(environment)).resolves.toMatchObject({
      webgl2: true,
      maxTextureSize: 4096,
      persistentStorage: true,
    });
  });
});
