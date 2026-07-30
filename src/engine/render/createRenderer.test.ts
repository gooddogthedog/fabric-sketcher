import { describe, expect, it, vi } from "vitest";
import { Canvas2DRenderer } from "./Canvas2DRenderer";
import { WebGL2Renderer } from "./WebGL2Renderer";
import {
  createRenderer,
  RendererInitializationError,
  type RendererStatus,
} from "./createRenderer";
import type { RenderStroke } from "./Renderer";

type ShaderHandle = Readonly<{ id: number; type: number }>;
type ProgramHandle = Readonly<{ id: number }>;
type BufferHandle = Readonly<{ id: number }>;

class FakeWebGL2Context {
  public readonly VERTEX_SHADER = 0x8b31;
  public readonly FRAGMENT_SHADER = 0x8b30;
  public readonly COMPILE_STATUS = 0x8b81;
  public readonly LINK_STATUS = 0x8b82;
  public readonly ARRAY_BUFFER = 0x8892;
  public readonly STATIC_DRAW = 0x88e4;
  public readonly DYNAMIC_DRAW = 0x88e8;
  public readonly FLOAT = 0x1406;
  public readonly TRIANGLE_STRIP = 0x0005;
  public readonly COLOR_BUFFER_BIT = 0x4000;
  public readonly BLEND = 0x0be2;
  public readonly DEPTH_TEST = 0x0b71;
  public readonly CULL_FACE = 0x0b44;
  public readonly ONE = 1;
  public readonly ONE_MINUS_SRC_ALPHA = 0x0303;

  public compileSucceeds = true;
  public linkSucceeds = true;
  public failBufferCreationAt: number | null = null;
  public shaderSources: string[] = [];
  public bufferUploads: Float32Array[] = [];
  public matrixUploads: Float32Array[] = [];
  public drawnVertexCounts: number[] = [];
  public enabledCapabilities: number[] = [];
  public disabledCapabilities: number[] = [];
  public blendFactors: Array<readonly [number, number]> = [];
  public deletedBuffers: BufferHandle[] = [];
  public deletedPrograms: ProgramHandle[] = [];
  public viewportCalls: Array<readonly [number, number, number, number]> = [];

  private nextId = 1;
  private bufferCreations = 0;

  public createShader(type: number): ShaderHandle {
    return { id: this.nextId++, type };
  }

  public shaderSource(...args: [ShaderHandle, string]): void {
    this.shaderSources.push(args[1]);
  }

  public compileShader(): void {}

  public getShaderParameter(...args: [ShaderHandle, number]): boolean {
    return args[1] === this.COMPILE_STATUS && this.compileSucceeds;
  }

  public getShaderInfoLog(): string {
    return "synthetic shader compile failure";
  }

  public deleteShader(): void {}

  public createProgram(): ProgramHandle {
    return { id: this.nextId++ };
  }

  public attachShader(): void {}

  public linkProgram(): void {}

  public getProgramParameter(...args: [ProgramHandle, number]): boolean {
    return args[1] === this.LINK_STATUS && this.linkSucceeds;
  }

  public getProgramInfoLog(): string {
    return "synthetic program link failure";
  }

  public deleteProgram(program: ProgramHandle): void {
    this.deletedPrograms.push(program);
  }

  public getUniformLocation(
    ...args: [ProgramHandle, string]
  ): Readonly<{ name: string }> {
    return { name: args[1] };
  }

  public createBuffer(): BufferHandle | null {
    this.bufferCreations += 1;
    if (this.bufferCreations === this.failBufferCreationAt) {
      return null;
    }
    return { id: this.nextId++ };
  }

  public deleteBuffer(buffer: BufferHandle): void {
    this.deletedBuffers.push(buffer);
  }

  public bindBuffer(): void {}

  public bufferData(...args: [number, Float32Array, number]): void {
    this.bufferUploads.push(new Float32Array(args[1]));
  }

  public useProgram(): void {}

  public enable(capability: number): void {
    this.enabledCapabilities.push(capability);
  }

  public disable(capability: number): void {
    this.disabledCapabilities.push(capability);
  }

  public blendFunc(source: number, destination: number): void {
    this.blendFactors.push([source, destination]);
  }

  public enableVertexAttribArray(): void {}

  public vertexAttribPointer(): void {}

  public uniformMatrix3fv(
    ...args: [Readonly<{ name: string }>, false, Float32Array]
  ): void {
    this.matrixUploads.push(new Float32Array(args[2]));
  }

  public uniform2f(): void {}

  public uniform4fv(): void {}

  public drawArrays(_mode: number, _first: number, count: number): void {
    this.drawnVertexCounts.push(count);
  }

  public viewport(x: number, y: number, width: number, height: number): void {
    this.viewportCalls.push([x, y, width, height]);
  }

  public clearColor(): void {}

  public clear(): void {}

  public asContext(): WebGL2RenderingContext {
    return this as unknown as WebGL2RenderingContext;
  }
}

class FakeCanvas2DContext {
  public fillStyle: string | CanvasGradient | CanvasPattern = "";
  public globalAlpha = 1;
  public readonly paths: Array<Array<readonly [number, number]>> = [];
  public readonly fillAlphas: number[] = [];
  private path: Array<readonly [number, number]> = [];

  public save(): void {}
  public restore(): void {}
  public clearRect(): void {}
  public setTransform(): void {}
  public beginPath(): void {
    this.path = [];
  }
  public moveTo(x: number, y: number): void {
    this.path.push([x, y]);
  }
  public lineTo(x: number, y: number): void {
    this.path.push([x, y]);
  }
  public closePath(): void {}
  public fill(): void {
    this.paths.push([...this.path]);
    this.fillAlphas.push(this.globalAlpha);
  }

  public asContext(): CanvasRenderingContext2D {
    return this as unknown as CanvasRenderingContext2D;
  }
}

function stroke(
  operationId: string,
  mesh = new Float32Array([0, 2, 1, 0, -2, 1, 10, 2, 0.75, 10, -2, 0.75]),
): RenderStroke {
  return {
    operationId,
    mesh,
    color: [0.25, 0.5, 0.75, 0.8],
    texture: {
      kind: "graphite",
      scale: 18,
      strength: 0.34,
      angle: 0,
      scatter: 0.18,
    },
    composite: "paint",
  };
}

function canvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

function compatibilitySurface(context = new FakeCanvas2DContext()): Readonly<{
  surface: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}> {
  return { surface: canvas(), context: context.asContext() };
}

describe("createRenderer", () => {
  it("selects WebGL2 and configures premultiplied-alpha blending", () => {
    const gl = new FakeWebGL2Context();
    const target = canvas();

    const selection = createRenderer(target, {
      getWebGL2Context: () => gl.asContext(),
      getCanvas2DContext: () => null,
    });

    expect(selection.renderer).toBeInstanceOf(WebGL2Renderer);
    expect(selection.renderer.kind).toBe("webgl2");
    expect(selection.surface).toBe(target);
    expect(selection.fallbackReason).toBeNull();
    expect(gl.enabledCapabilities).toContain(gl.BLEND);
    expect(gl.disabledCapabilities).toEqual(
      expect.arrayContaining([gl.DEPTH_TEST, gl.CULL_FACE]),
    );
    expect(gl.blendFactors).toContainEqual([gl.ONE, gl.ONE_MINUS_SRC_ALPHA]);
    expect(gl.shaderSources.join("\n")).toContain("color.rgb * effectiveAlpha");
  });

  it("returns an inspectable compatibility reason when WebGL2 is unavailable", () => {
    const context2d = new FakeCanvas2DContext();
    const target = canvas();

    const selection = createRenderer(target, {
      getWebGL2Context: () => null,
      getCanvas2DContext: () => context2d.asContext(),
    });

    expect(selection.renderer).toBeInstanceOf(Canvas2DRenderer);
    expect(selection.renderer.kind).toBe("canvas2d-compat");
    expect(selection.surface).toBe(target);
    expect(selection.fallbackReason).toMatchObject({
      code: "webgl2-context-unavailable",
    });
    expect(selection.fallbackReason?.message).not.toHaveLength(0);
  });

  it("falls back explicitly when WebGL shader compilation fails", () => {
    const gl = new FakeWebGL2Context();
    gl.compileSucceeds = false;

    const selection = createRenderer(canvas(), {
      getWebGL2Context: () => gl.asContext(),
      createCompatibilitySurface: () => compatibilitySurface(),
    });

    expect(selection.renderer.kind).toBe("canvas2d-compat");
    expect(selection.fallbackReason).toMatchObject({
      code: "webgl2-initialization-failed",
    });
    expect(selection.fallbackReason?.message).toContain(
      "synthetic shader compile failure",
    );
  });

  it("falls back explicitly when WebGL program linking fails", () => {
    const gl = new FakeWebGL2Context();
    gl.linkSucceeds = false;

    const selection = createRenderer(canvas(), {
      getWebGL2Context: () => gl.asContext(),
      createCompatibilitySurface: () => compatibilitySurface(),
    });

    expect(selection.renderer.kind).toBe("canvas2d-compat");
    expect(selection.fallbackReason).toMatchObject({
      code: "webgl2-initialization-failed",
    });
    expect(selection.fallbackReason?.message).toContain(
      "synthetic program link failure",
    );
    expect(gl.deletedPrograms).toHaveLength(1);
  });

  it("reports thrown WebGL context creation failures without hiding the fallback", () => {
    const target = canvas();
    const selection = createRenderer(target, {
      getWebGL2Context: () => {
        throw new Error("synthetic context creation failure");
      },
      getCanvas2DContext: () => new FakeCanvas2DContext().asContext(),
    });

    expect(selection.renderer.kind).toBe("canvas2d-compat");
    expect(selection.surface).toBe(target);
    expect(selection.fallbackReason).toEqual({
      code: "webgl2-context-creation-failed",
      message:
        "WebGL2 context creation failed: synthetic context creation failure",
    });
  });

  it("replaces an acquired WebGL canvas with a working structural clone after shader failure", () => {
    const gl = new FakeWebGL2Context();
    gl.compileSucceeds = false;
    const context2d = new FakeCanvas2DContext();
    const host = document.createElement("section");
    const target = canvas();
    target.id = "drawing-surface";
    target.className = "canvas canvas--active";
    target.width = 640;
    target.height = 480;
    target.setAttribute("aria-label", "Sketch canvas");
    host.append(target);
    document.body.append(host);
    let sameCanvas2DRequests = 0;
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(function (
        this: HTMLCanvasElement,
        contextId: string,
      ) {
        if (this === target && contextId === "webgl2") {
          return gl.asContext();
        }
        if (this === target && contextId === "2d") {
          sameCanvas2DRequests += 1;
          return null;
        }
        if (this !== target && contextId === "2d") {
          return context2d.asContext();
        }
        return null;
      } as unknown as HTMLCanvasElement["getContext"]);

    try {
      const selection = createRenderer(target);

      expect(selection.renderer.kind).toBe("canvas2d-compat");
      expect(selection.fallbackReason).toMatchObject({
        code: "webgl2-initialization-failed",
      });
      expect(selection.surface).not.toBe(target);
      expect(host.firstElementChild).toBe(selection.surface);
      expect(selection.surface).toMatchObject({
        id: "drawing-surface",
        className: "canvas canvas--active",
        width: 640,
        height: 480,
      });
      expect(selection.surface.getAttribute("aria-label")).toBe(
        "Sketch canvas",
      );
      expect(sameCanvas2DRequests).toBe(0);

      selection.renderer.commitStroke(stroke("recovered"));
      selection.renderer.render(0);
      expect(context2d.paths).toHaveLength(1);
    } finally {
      getContext.mockRestore();
      host.remove();
    }
  });

  it("supports an injected fresh compatibility surface after WebGL acquisition", () => {
    const gl = new FakeWebGL2Context();
    gl.linkSucceeds = false;
    const target = canvas();
    const freshSurface = canvas();
    const context2d = new FakeCanvas2DContext();
    const createCompatibilitySurface = vi.fn(() => ({
      surface: freshSurface,
      context: context2d.asContext(),
    }));

    const selection = createRenderer(target, {
      getWebGL2Context: () => gl.asContext(),
      createCompatibilitySurface,
    });

    expect(createCompatibilitySurface).toHaveBeenCalledWith(target);
    expect(selection.surface).toBe(freshSurface);
    expect(selection.renderer.kind).toBe("canvas2d-compat");
  });

  it("throws an explicit hard error when no working compatibility context can be created", () => {
    const gl = new FakeWebGL2Context();
    gl.compileSucceeds = false;

    expect(() =>
      createRenderer(canvas(), {
        getWebGL2Context: () => gl.asContext(),
        createCompatibilitySurface: () => ({
          surface: canvas(),
          context: null,
        }),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<RendererInitializationError>>({
        name: "RendererInitializationError",
        code: "canvas2d-context-unavailable",
      }),
    );
  });

  it("uploads row-major viewport matrices in WebGL column-major order", () => {
    const gl = new FakeWebGL2Context();
    const { renderer } = createRenderer(canvas(), {
      getWebGL2Context: () => gl.asContext(),
      getCanvas2DContext: () => null,
    });

    renderer.setViewport([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    renderer.render(0);

    expect(Array.from(gl.matrixUploads.at(-1) ?? [])).toEqual([
      1, 4, 7, 2, 5, 8, 3, 6, 9,
    ]);
  });

  it("pauses GPU drawing on context loss and automatically replays all retained operations on restore", () => {
    const firstContext = new FakeWebGL2Context();
    const restoredContext = new FakeWebGL2Context();
    const statuses: RendererStatus[] = [];
    let currentContext = firstContext;
    const target = canvas();
    const { renderer } = createRenderer(target, {
      getWebGL2Context: () => currentContext.asContext(),
      getCanvas2DContext: () => null,
      onStatus: (status) => statuses.push(status),
    });
    renderer.replaceDocument([stroke("saved")]);
    renderer.render(0);
    expect(firstContext.drawnVertexCounts).toEqual([4]);

    const lostEvent = new Event("webglcontextlost", { cancelable: true });
    target.dispatchEvent(lostEvent);
    expect(lostEvent.defaultPrevented).toBe(true);
    renderer.commitStroke(stroke("during-loss"));
    renderer.render(1);
    expect(firstContext.drawnVertexCounts).toEqual([4]);
    expect(statuses.at(-1)).toMatchObject({
      type: "context-lost",
      recoverable: true,
    });

    currentContext = restoredContext;
    target.dispatchEvent(new Event("webglcontextrestored"));

    expect(restoredContext.bufferUploads).toHaveLength(2);
    expect(restoredContext.drawnVertexCounts).toEqual([4, 4]);
    expect(statuses.at(-1)).toMatchObject({
      type: "context-restored",
      recoverable: true,
    });
  });

  it("reports restore failures as recoverable and releases partially rebuilt GPU state", () => {
    const firstContext = new FakeWebGL2Context();
    const restoredContext = new FakeWebGL2Context();
    restoredContext.failBufferCreationAt = 3;
    const statuses: RendererStatus[] = [];
    let currentContext = firstContext;
    const target = canvas();
    const { renderer } = createRenderer(target, {
      getWebGL2Context: () => currentContext.asContext(),
      getCanvas2DContext: () => null,
      onStatus: (status) => statuses.push(status),
    });
    renderer.replaceDocument([stroke("first"), stroke("second")]);
    target.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));

    currentContext = restoredContext;
    target.dispatchEvent(new Event("webglcontextrestored"));

    expect(statuses.at(-1)).toMatchObject({
      type: "context-restore-failed",
      recoverable: true,
    });
    expect(restoredContext.deletedBuffers).toHaveLength(2);
    expect(restoredContext.deletedPrograms).toHaveLength(1);
    renderer.render(0);
    expect(restoredContext.drawnVertexCounts).toEqual([]);
  });

  it("keeps committed, confirmed-preview, and replaceable predicted geometry separate", () => {
    const gl = new FakeWebGL2Context();
    const { renderer } = createRenderer(canvas(), {
      getWebGL2Context: () => gl.asContext(),
      getCanvas2DContext: () => null,
    });
    renderer.commitStroke(stroke("committed"));
    renderer.previewStroke(
      stroke("confirmed", new Float32Array(18)),
      stroke("predicted", new Float32Array(24)),
    );

    renderer.render(0);
    expect(gl.drawnVertexCounts).toEqual([4, 6, 8]);

    renderer.previewStroke(
      stroke("confirmed", new Float32Array(18)),
      stroke("predicted-next", new Float32Array(30)),
    );
    renderer.render(1);
    expect(gl.drawnVertexCounts.slice(-3)).toEqual([4, 6, 10]);

    renderer.clearPreview();
    renderer.render(2);
    expect(gl.drawnVertexCounts.at(-1)).toBe(4);
  });

  it("disposes event listeners, programs, and buffers exactly once", () => {
    const gl = new FakeWebGL2Context();
    const target = canvas();
    const removeEventListener = vi.spyOn(target, "removeEventListener");
    const { renderer } = createRenderer(target, {
      getWebGL2Context: () => gl.asContext(),
      getCanvas2DContext: () => null,
    });
    renderer.commitStroke(stroke("committed"));

    renderer.dispose();
    const releasedAfterFirstDispose = {
      buffers: gl.deletedBuffers.length,
      programs: gl.deletedPrograms.length,
      listeners: removeEventListener.mock.calls.length,
    };
    renderer.dispose();

    expect(releasedAfterFirstDispose).toEqual({
      buffers: 2,
      programs: 1,
      listeners: 2,
    });
    expect(gl.deletedBuffers).toHaveLength(2);
    expect(gl.deletedPrograms).toHaveLength(1);
    expect(removeEventListener).toHaveBeenCalledTimes(2);
  });

  it("fills Canvas 2D triangle-strip segments without deduplicating coordinates", () => {
    const context2d = new FakeCanvas2DContext();
    const { renderer } = createRenderer(canvas(), {
      getWebGL2Context: () => null,
      getCanvas2DContext: () => context2d.asContext(),
    });
    renderer.replaceDocument([
      stroke(
        "repeated-coordinate-strip",
        new Float32Array([
          0, 1, 1, 0, -1, 1, 0, 1, 0.8, 5, -1, 0.8, 10, 1, 0.6, 10, -1, 0.6,
        ]),
      ),
    ]);

    renderer.render(0);

    expect(context2d.paths).toEqual([
      [
        [0, 1],
        [0, 1],
        [5, -1],
        [0, -1],
      ],
      [
        [0, 1],
        [10, 1],
        [10, -1],
        [5, -1],
      ],
    ]);
  });

  it("uses ordered segment-local alpha for varying-pressure Canvas 2D strips", () => {
    const context2d = new FakeCanvas2DContext();
    const { renderer } = createRenderer(canvas(), {
      getWebGL2Context: () => null,
      getCanvas2DContext: () => context2d.asContext(),
    });
    renderer.commitStroke(
      stroke(
        "varying-alpha",
        new Float32Array([
          0, 1, 0, 0, -1, 0.2, 10, 1, 0.2, 10, -1, 0.4, 20, 1, 0.6, 20, -1, 0.8,
          30, 1, 1, 30, -1, 1,
        ]),
      ),
    );

    renderer.render(0);

    expect(context2d.paths).toHaveLength(3);
    expect(context2d.fillAlphas).toEqual([
      expect.closeTo(0.16),
      expect.closeTo(0.4),
      expect.closeTo(0.68),
    ]);
  });

  it("renders confirmed and predicted previews in Canvas 2D compatibility mode", () => {
    const context2d = new FakeCanvas2DContext();
    const { renderer } = createRenderer(canvas(), {
      getWebGL2Context: () => null,
      getCanvas2DContext: () => context2d.asContext(),
    });
    renderer.commitStroke(stroke("committed"));
    renderer.previewStroke(stroke("confirmed"), stroke("predicted"));

    renderer.render(0);
    expect(context2d.paths).toHaveLength(3);

    renderer.clearPreview();
    renderer.render(1);
    expect(context2d.paths).toHaveLength(4);
  });
});
