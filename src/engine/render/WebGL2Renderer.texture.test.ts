import { describe, expect, it } from "vitest";
import { getBrushPreset } from "../brush/presets";
import type { RenderStroke } from "./Renderer";
import { STROKE_FRAGMENT_SHADER, STROKE_VERTEX_SHADER } from "./shaders";
import { WebGL2Renderer } from "./WebGL2Renderer";

type ShaderHandle = Readonly<{ id: number; type: number }>;
type ProgramHandle = Readonly<{ id: number }>;
type BufferHandle = Readonly<{ id: number }>;
type UniformHandle = Readonly<{ name: string }>;
type DrawEvent =
  | Readonly<{ type: "uniform1i"; name: string; value: number }>
  | Readonly<{ type: "uniform1f"; name: string; value: number }>
  | Readonly<{ type: "draw"; count: number }>;

type BlendCall = Readonly<{ source: number; destination: number }>;

class TextureCaptureWebGL2Context {
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
  public readonly ZERO = 0;
  public readonly ONE = 1;
  public readonly ONE_MINUS_SRC_ALPHA = 0x0303;

  public readonly events: DrawEvent[] = [];
  public readonly requestedUniforms: string[] = [];
  private nextId = 1;

  public createShader(type: number): ShaderHandle {
    return { id: this.nextId++, type };
  }

  public shaderSource(): void {}
  public compileShader(): void {}
  public getShaderParameter(_shader: ShaderHandle, parameter: number): boolean {
    return parameter === this.COMPILE_STATUS;
  }
  public getShaderInfoLog(): string {
    return "";
  }
  public deleteShader(): void {}

  public createProgram(): ProgramHandle {
    return { id: this.nextId++ };
  }
  public attachShader(): void {}
  public linkProgram(): void {}
  public getProgramParameter(
    _program: ProgramHandle,
    parameter: number,
  ): boolean {
    return parameter === this.LINK_STATUS;
  }
  public getProgramInfoLog(): string {
    return "";
  }
  public deleteProgram(): void {}

  public getUniformLocation(
    _program: ProgramHandle,
    name: string,
  ): UniformHandle {
    this.requestedUniforms.push(name);
    return { name };
  }

  public createBuffer(): BufferHandle {
    return { id: this.nextId++ };
  }
  public deleteBuffer(): void {}
  public bindBuffer(): void {}
  public bufferData(): void {}
  public useProgram(): void {}
  public enable(): void {}
  public disable(): void {}
  /** Kept out of `events` so exhaustive draw-order assertions stay stable. */
  public readonly blendCalls: BlendCall[] = [];

  public blendFunc(source: number, destination: number): void {
    this.blendCalls.push({ source, destination });
  }
  public enableVertexAttribArray(): void {}
  public vertexAttribPointer(): void {}
  public uniformMatrix3fv(): void {}
  public uniform2f(): void {}
  public uniform4fv(): void {}
  public viewport(): void {}
  public clearColor(): void {}
  public clear(): void {}

  public uniform1i(location: UniformHandle, value: number): void {
    this.events.push({ type: "uniform1i", name: location.name, value });
  }

  public uniform1f(location: UniformHandle, value: number): void {
    this.events.push({ type: "uniform1f", name: location.name, value });
  }

  public drawArrays(_mode: number, _first: number, count: number): void {
    this.events.push({ type: "draw", count });
  }

  public asContext(): WebGL2RenderingContext {
    return this as unknown as WebGL2RenderingContext;
  }
}

function stroke(
  operationId: string,
  presetId: Parameters<typeof getBrushPreset>[0],
): RenderStroke {
  return {
    operationId,
    mesh: new Float32Array([10, 12, 1, 10, 8, 1, 30, 12, 0.75, 30, 8, 0.75]),
    color: [0.2, 0.4, 0.6, 0.8],
    texture: getBrushPreset(presetId).texture,
    composite: "paint",
  };
}

function canvas(): HTMLCanvasElement {
  const target = document.createElement("canvas");
  target.width = 320;
  target.height = 200;
  return target;
}

describe("WebGL2 erase compositing", () => {
  it("erases with a destination-attenuating blend and restores paint blending", () => {
    const gl = new TextureCaptureWebGL2Context();
    const renderer = new WebGL2Renderer(canvas(), gl.asContext(), {
      getContext: () => gl.asContext(),
    });

    renderer.replaceDocument([
      stroke("painted", "denim-v1"),
      { ...stroke("erased", "denim-v1"), composite: "erase" },
    ]);
    renderer.render(0);

    // One call comes from constructor setup; a painted mark must add none.
    expect(gl.blendCalls).toHaveLength(3);
    expect(gl.blendCalls.slice(-2)).toEqual([
      { source: gl.ZERO, destination: gl.ONE_MINUS_SRC_ALPHA },
      { source: gl.ONE, destination: gl.ONE_MINUS_SRC_ALPHA },
    ]);
  });
});

describe("WebGL2 procedural material texture", () => {
  it("anchors deterministic material coverage to document coordinates", () => {
    expect(STROKE_VERTEX_SHADER).toContain("v_document_position");
    expect(STROKE_VERTEX_SHADER).toContain("v_document_position = a_position");
    expect(STROKE_FRAGMENT_SHADER).toContain("v_document_position");
    expect(STROKE_FRAGMENT_SHADER).not.toContain("gl_FragCoord");
    expect(STROKE_FRAGMENT_SHADER).not.toContain("u_time");
  });

  it("keeps five visibly distinct coverage functions and premultiplied output", () => {
    expect(STROKE_FRAGMENT_SHADER).toContain("graphiteCoverage");
    expect(STROKE_FRAGMENT_SHADER).toContain("silkCoverage");
    expect(STROKE_FRAGMENT_SHADER).toContain("denimCoverage");
    expect(STROKE_FRAGMENT_SHADER).toContain("woolCoverage");
    expect(STROKE_FRAGMENT_SHADER).toContain("knitCoverage");
    expect(STROKE_FRAGMENT_SHADER).toContain("u_texture_kind");
    expect(STROKE_FRAGMENT_SHADER).toContain("u_color.rgb * effectiveAlpha");
  });

  it("uploads each retained and preview stroke's texture immediately before drawing it", () => {
    const gl = new TextureCaptureWebGL2Context();
    const renderer = new WebGL2Renderer(canvas(), gl.asContext(), {
      getContext: () => gl.asContext(),
    });
    renderer.commitStroke(stroke("retained", "denim-v1"));
    renderer.previewStroke(
      stroke("confirmed", "silk-v1"),
      stroke("predicted", "knit-v1"),
    );

    renderer.render(123_456);

    expect(gl.events).toEqual([
      { type: "uniform1i", name: "u_texture_kind", value: 2 },
      { type: "uniform1f", name: "u_texture_scale", value: 38 },
      { type: "uniform1f", name: "u_texture_strength", value: 0.62 },
      {
        type: "uniform1f",
        name: "u_texture_angle",
        value: 0.7330382858376184,
      },
      { type: "uniform1f", name: "u_texture_scatter", value: 0.12 },
      { type: "draw", count: 4 },
      { type: "uniform1i", name: "u_texture_kind", value: 1 },
      { type: "uniform1f", name: "u_texture_scale", value: 84 },
      { type: "uniform1f", name: "u_texture_strength", value: 0.3 },
      {
        type: "uniform1f",
        name: "u_texture_angle",
        value: -0.20943951023931956,
      },
      { type: "uniform1f", name: "u_texture_scatter", value: 0.06 },
      { type: "draw", count: 4 },
      { type: "uniform1i", name: "u_texture_kind", value: 4 },
      { type: "uniform1f", name: "u_texture_scale", value: 62 },
      { type: "uniform1f", name: "u_texture_strength", value: 0.54 },
      { type: "uniform1f", name: "u_texture_angle", value: 0 },
      { type: "uniform1f", name: "u_texture_scatter", value: 0.16 },
      { type: "draw", count: 4 },
    ]);
  });

  it("recreates texture locations and automatically repaints retained snapshots after context restoration", () => {
    const initial = new TextureCaptureWebGL2Context();
    const restored = new TextureCaptureWebGL2Context();
    let active = initial;
    const target = canvas();
    const renderer = new WebGL2Renderer(target, initial.asContext(), {
      getContext: () => active.asContext(),
    });
    renderer.replaceDocument([stroke("saved", "wool-v1")]);

    target.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    active = restored;
    target.dispatchEvent(new Event("webglcontextrestored"));

    expect(restored.requestedUniforms).toEqual(
      expect.arrayContaining([
        "u_texture_kind",
        "u_texture_scale",
        "u_texture_strength",
        "u_texture_angle",
        "u_texture_scatter",
      ]),
    );
    expect(restored.events).toEqual([
      { type: "uniform1i", name: "u_texture_kind", value: 3 },
      { type: "uniform1f", name: "u_texture_scale", value: 26 },
      { type: "uniform1f", name: "u_texture_strength", value: 0.58 },
      {
        type: "uniform1f",
        name: "u_texture_angle",
        value: 0.13962634015954636,
      },
      { type: "uniform1f", name: "u_texture_scatter", value: 0.72 },
      { type: "draw", count: 4 },
    ]);
  });
});
