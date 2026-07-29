import { identity, type Matrix3 } from "../math/affine";
import type { Renderer, RenderStroke } from "./Renderer";
import { STROKE_FRAGMENT_SHADER, STROKE_VERTEX_SHADER } from "./shaders";
import { textureUniforms } from "./textureUniforms";

export type WebGLRendererStatus = Readonly<{
  type: "context-lost" | "context-restored" | "context-restore-failed";
  recoverable: true;
  message: string;
}>;

export type WebGL2RendererOptions = Readonly<{
  getContext: () => WebGL2RenderingContext | null;
  onStatus?: (status: WebGLRendererStatus) => void;
}>;

type ProgramState = Readonly<{
  program: WebGLProgram;
  viewportLocation: WebGLUniformLocation;
  resolutionLocation: WebGLUniformLocation;
  colorLocation: WebGLUniformLocation;
  textureKindLocation: WebGLUniformLocation;
  textureScaleLocation: WebGLUniformLocation;
  textureStrengthLocation: WebGLUniformLocation;
  textureAngleLocation: WebGLUniformLocation;
  textureScatterLocation: WebGLUniformLocation;
}>;

const VERTEX_STRIDE = 3;
const VERTEX_STRIDE_BYTES = VERTEX_STRIDE * Float32Array.BYTES_PER_ELEMENT;

export class WebGL2Renderer implements Renderer {
  public readonly kind = "webgl2";

  private readonly strokes = new Map<string, RenderStroke>();
  private readonly retainedBuffers = new Map<string, WebGLBuffer>();
  private gl: WebGL2RenderingContext;
  private programState: ProgramState | null = null;
  private previewBuffer: WebGLBuffer | null = null;
  private viewportMatrix: Matrix3 = identity();
  private confirmedPreview: RenderStroke | null = null;
  private predictedPreview: RenderStroke | null = null;
  private logicalWidth: number;
  private logicalHeight: number;
  private lost = false;
  private disposed = false;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    context: WebGL2RenderingContext,
    private readonly options: WebGL2RendererOptions,
  ) {
    this.gl = context;
    this.logicalWidth = Math.max(1, canvas.clientWidth || canvas.width || 1);
    this.logicalHeight = Math.max(1, canvas.clientHeight || canvas.height || 1);
    this.initializeGpuState();
    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.addEventListener(
      "webglcontextrestored",
      this.handleContextRestored,
    );
  }

  public resize(
    pixelWidth: number,
    pixelHeight: number,
    devicePixelRatio: number,
  ): void {
    if (this.disposed) {
      return;
    }

    const ratio = positiveOrOne(devicePixelRatio);
    this.logicalWidth = Math.max(1, pixelWidth);
    this.logicalHeight = Math.max(1, pixelHeight);
    this.canvas.width = Math.max(
      1,
      Math.round(Math.max(0, pixelWidth) * ratio),
    );
    this.canvas.height = Math.max(
      1,
      Math.round(Math.max(0, pixelHeight) * ratio),
    );
    if (!this.lost) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  public setViewport(matrix: Matrix3): void {
    this.viewportMatrix = matrix;
  }

  public replaceDocument(strokes: readonly RenderStroke[]): void {
    if (this.disposed) {
      return;
    }

    this.deleteRetainedBuffers();
    this.strokes.clear();
    for (const stroke of strokes) {
      this.strokes.set(stroke.operationId, stroke);
    }
    if (!this.lost) {
      this.rebuildRetainedBuffers();
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
    if (this.disposed) {
      return;
    }

    const previousBuffer = this.retainedBuffers.get(stroke.operationId);
    if (previousBuffer !== undefined && !this.lost) {
      this.gl.deleteBuffer(previousBuffer);
    }
    this.retainedBuffers.delete(stroke.operationId);
    this.strokes.set(stroke.operationId, stroke);
    if (!this.lost) {
      this.retainedBuffers.set(
        stroke.operationId,
        this.createStrokeBuffer(stroke),
      );
    }
  }

  public clearPreview(): void {
    this.confirmedPreview = null;
    this.predictedPreview = null;
  }

  public render(now: number): void {
    void now;
    if (
      this.disposed ||
      this.lost ||
      this.programState === null ||
      this.previewBuffer === null
    ) {
      return;
    }

    const gl = this.gl;
    const state = this.programState;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(state.program);
    gl.uniformMatrix3fv(
      state.viewportLocation,
      false,
      toWebGLColumnMajor(this.viewportMatrix),
    );
    gl.uniform2f(
      state.resolutionLocation,
      this.logicalWidth,
      this.logicalHeight,
    );

    for (const [operationId, stroke] of this.strokes) {
      const buffer = this.retainedBuffers.get(operationId);
      if (buffer !== undefined) {
        this.drawBuffer(buffer, stroke);
      }
    }
    if (this.confirmedPreview !== null) {
      this.drawPreview(this.confirmedPreview);
    }
    if (this.predictedPreview !== null) {
      this.drawPreview(this.predictedPreview);
    }
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener(
      "webglcontextrestored",
      this.handleContextRestored,
    );
    this.releaseGpuState();
    this.strokes.clear();
    this.clearPreview();
  }

  private readonly handleContextLost = (event: Event): void => {
    if (this.disposed || this.lost) {
      return;
    }

    event.preventDefault();
    this.lost = true;
    this.abandonGpuReferences();
    this.options.onStatus?.({
      type: "context-lost",
      recoverable: true,
      message:
        "WebGL context lost; drawing is paused while recovery is attempted.",
    });
  };

  private readonly handleContextRestored = (): void => {
    if (this.disposed || !this.lost) {
      return;
    }

    try {
      const restoredContext = this.options.getContext();
      if (restoredContext === null) {
        throw new Error("WebGL2 context was unavailable during restore");
      }
      this.gl = restoredContext;
      this.initializeGpuState();
      this.rebuildRetainedBuffers();
      this.lost = false;
      this.render(performance.now());
      this.options.onStatus?.({
        type: "context-restored",
        recoverable: true,
        message: "WebGL context restored; retained strokes were replayed.",
      });
    } catch (error) {
      this.lost = true;
      this.releaseGpuState(true);
      this.options.onStatus?.({
        type: "context-restore-failed",
        recoverable: true,
        message: `WebGL context restore failed: ${errorMessage(error)}`,
      });
    }
  };

  private initializeGpuState(): void {
    const state = createProgramState(this.gl);
    const previewBuffer = this.gl.createBuffer();
    if (previewBuffer === null) {
      this.gl.deleteProgram(state.program);
      throw new Error("WebGL failed to create the preview buffer");
    }

    this.programState = state;
    this.previewBuffer = previewBuffer;
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.disable(this.gl.CULL_FACE);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  private rebuildRetainedBuffers(): void {
    for (const stroke of this.strokes.values()) {
      this.retainedBuffers.set(
        stroke.operationId,
        this.createStrokeBuffer(stroke),
      );
    }
  }

  private createStrokeBuffer(stroke: RenderStroke): WebGLBuffer {
    const buffer = this.gl.createBuffer();
    if (buffer === null) {
      throw new Error(
        `WebGL failed to create a buffer for ${stroke.operationId}`,
      );
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, stroke.mesh, this.gl.STATIC_DRAW);
    return buffer;
  }

  private drawPreview(stroke: RenderStroke): void {
    if (this.previewBuffer === null) {
      return;
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.previewBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, stroke.mesh, this.gl.DYNAMIC_DRAW);
    this.drawBoundBuffer(stroke);
  }

  private drawBuffer(buffer: WebGLBuffer, stroke: RenderStroke): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.drawBoundBuffer(stroke);
  }

  private drawBoundBuffer(stroke: RenderStroke): void {
    if (this.programState === null) {
      return;
    }

    const vertexCount = Math.floor(stroke.mesh.length / VERTEX_STRIDE);
    if (vertexCount < 3) {
      return;
    }
    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(
      0,
      2,
      this.gl.FLOAT,
      false,
      VERTEX_STRIDE_BYTES,
      0,
    );
    this.gl.enableVertexAttribArray(1);
    this.gl.vertexAttribPointer(
      1,
      1,
      this.gl.FLOAT,
      false,
      VERTEX_STRIDE_BYTES,
      2 * Float32Array.BYTES_PER_ELEMENT,
    );
    this.gl.uniform4fv(this.programState.colorLocation, stroke.color);
    const texture = textureUniforms(stroke.texture);
    uploadUniform1i(
      this.gl,
      this.programState.textureKindLocation,
      texture.kind,
    );
    uploadUniform1f(
      this.gl,
      this.programState.textureScaleLocation,
      texture.scale,
    );
    uploadUniform1f(
      this.gl,
      this.programState.textureStrengthLocation,
      texture.strength,
    );
    uploadUniform1f(
      this.gl,
      this.programState.textureAngleLocation,
      texture.angleRadians,
    );
    uploadUniform1f(
      this.gl,
      this.programState.textureScatterLocation,
      texture.scatter,
    );
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, vertexCount);
  }

  private deleteRetainedBuffers(deleteEvenIfLost = false): void {
    if (!this.lost || deleteEvenIfLost) {
      for (const buffer of this.retainedBuffers.values()) {
        this.gl.deleteBuffer(buffer);
      }
    }
    this.retainedBuffers.clear();
  }

  private releaseGpuState(deleteEvenIfLost = false): void {
    this.deleteRetainedBuffers(deleteEvenIfLost);
    if (this.previewBuffer !== null) {
      this.gl.deleteBuffer(this.previewBuffer);
    }
    if (this.programState !== null) {
      this.gl.deleteProgram(this.programState.program);
    }
    this.previewBuffer = null;
    this.programState = null;
  }

  private abandonGpuReferences(): void {
    this.retainedBuffers.clear();
    this.previewBuffer = null;
    this.programState = null;
  }
}

function createProgramState(gl: WebGL2RenderingContext): ProgramState {
  const vertexShader = compileShader(
    gl,
    gl.VERTEX_SHADER,
    STROKE_VERTEX_SHADER,
  );
  let fragmentShader: WebGLShader | null = null;
  let program: WebGLProgram | null = null;

  try {
    fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      STROKE_FRAGMENT_SHADER,
    );
    program = gl.createProgram();
    if (program === null) {
      throw new Error("WebGL failed to create the stroke program");
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        `WebGL stroke program link failed: ${gl.getProgramInfoLog(program) ?? "unknown error"}`,
      );
    }

    const viewportLocation = requiredUniform(gl, program, "u_viewport");
    const resolutionLocation = requiredUniform(gl, program, "u_resolution");
    const colorLocation = requiredUniform(gl, program, "u_color");
    const textureKindLocation = requiredUniform(gl, program, "u_texture_kind");
    const textureScaleLocation = requiredUniform(
      gl,
      program,
      "u_texture_scale",
    );
    const textureStrengthLocation = requiredUniform(
      gl,
      program,
      "u_texture_strength",
    );
    const textureAngleLocation = requiredUniform(
      gl,
      program,
      "u_texture_angle",
    );
    const textureScatterLocation = requiredUniform(
      gl,
      program,
      "u_texture_scatter",
    );
    return {
      program,
      viewportLocation,
      resolutionLocation,
      colorLocation,
      textureKindLocation,
      textureScaleLocation,
      textureStrengthLocation,
      textureAngleLocation,
      textureScatterLocation,
    };
  } catch (error) {
    if (program !== null) {
      gl.deleteProgram(program);
    }
    throw error;
  } finally {
    gl.deleteShader(vertexShader);
    if (fragmentShader !== null) {
      gl.deleteShader(fragmentShader);
    }
  }
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) {
    throw new Error("WebGL failed to create a stroke shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const diagnostic = gl.getShaderInfoLog(shader) ?? "unknown error";
    gl.deleteShader(shader);
    throw new Error(`WebGL stroke shader compilation failed: ${diagnostic}`);
  }
  return shader;
}

function requiredUniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (location === null) {
    throw new Error(`WebGL stroke program is missing ${name}`);
  }
  return location;
}

function uploadUniform1i(
  gl: WebGL2RenderingContext,
  location: WebGLUniformLocation,
  value: number,
): void {
  if (typeof gl.uniform1i === "function") {
    gl.uniform1i(location, value);
  }
}

function uploadUniform1f(
  gl: WebGL2RenderingContext,
  location: WebGLUniformLocation,
  value: number,
): void {
  if (typeof gl.uniform1f === "function") {
    gl.uniform1f(location, value);
  }
}

/** Convert a row-major Matrix3 into the column-major order WebGL consumes. */
function toWebGLColumnMajor(matrix: Matrix3): Float32Array {
  return new Float32Array([
    matrix[0],
    matrix[3],
    matrix[6],
    matrix[1],
    matrix[4],
    matrix[7],
    matrix[2],
    matrix[5],
    matrix[8],
  ]);
}

function positiveOrOne(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
