import { describe, expect, it } from "vitest";
import { Canvas2DRenderer } from "./Canvas2DRenderer";
import type { RenderStroke } from "./Renderer";

class FakeCanvasContext {
  public fillStyle: string | CanvasGradient | CanvasPattern = "";
  public globalAlpha = 1;
  public readonly fills: Array<
    Readonly<{ fillStyle: unknown; alpha: number }>
  > = [];
  public readonly patterns: Array<readonly [HTMLCanvasElement, "repeat"]> = [];
  public patternResult: CanvasPattern | null = {
    source: "texture",
  } as unknown as CanvasPattern;

  public save(): void {}
  public restore(): void {}
  public clearRect(): void {}
  public setTransform(): void {}
  public beginPath(): void {}
  public moveTo(): void {}
  public lineTo(): void {}
  public closePath(): void {}
  public fill(): void {
    this.fills.push({ fillStyle: this.fillStyle, alpha: this.globalAlpha });
  }
  public createPattern(
    tile: HTMLCanvasElement,
    repetition: "repeat",
  ): CanvasPattern | null {
    this.patterns.push([tile, repetition]);
    return this.patternResult;
  }

  public asContext(): CanvasRenderingContext2D {
    return this as unknown as CanvasRenderingContext2D;
  }
}

function textureDocument(): Pick<Document, "createElement"> {
  const tileContext = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    fillRect(): void {},
    beginPath(): void {},
    moveTo(): void {},
    lineTo(): void {},
    arc(): void {},
    stroke(): void {},
  };
  const tile = {
    width: 0,
    height: 0,
    getContext(): CanvasRenderingContext2D {
      return tileContext as unknown as CanvasRenderingContext2D;
    },
  };

  return {
    createElement(): HTMLCanvasElement {
      return tile as unknown as HTMLCanvasElement;
    },
  };
}

function stroke(): RenderStroke {
  return {
    operationId: "stroke-1",
    mesh: new Float32Array([0, 2, 1, 0, -2, 1, 10, 2, 0.5, 10, -2, 0.5]),
    color: [0.25, 0.5, 0.75, 0.8],
    texture: {
      kind: "denim",
      scale: 38,
      strength: 0.62,
      angle: 42,
      scatter: 0.12,
    },
  };
}

describe("Canvas2DRenderer texture compatibility", () => {
  it("repeats a cached texture pattern while retaining the segment pressure alpha", () => {
    const context = new FakeCanvasContext();
    const renderer = new Canvas2DRenderer(
      document.createElement("canvas"),
      context.asContext(),
      textureDocument(),
    );
    renderer.replaceDocument([
      stroke(),
      { ...stroke(), operationId: "stroke-2" },
    ]);

    renderer.render(0);

    expect(context.patterns).toHaveLength(1);
    expect(context.patterns[0]?.[1]).toBe("repeat");
    expect(context.fills).toHaveLength(2);
    for (const fill of context.fills) {
      expect(fill.fillStyle).toBe(context.patternResult);
      expect(fill.alpha).toBeCloseTo(0.6);
    }
  });

  it("falls back to a solid RGB fill when Canvas cannot create a pattern", () => {
    const context = new FakeCanvasContext();
    context.patternResult = null;
    const renderer = new Canvas2DRenderer(
      document.createElement("canvas"),
      context.asContext(),
      textureDocument(),
    );
    renderer.commitStroke(stroke());

    renderer.render(0);

    expect(context.fills).toHaveLength(1);
    expect(context.fills[0]?.fillStyle).toBe("rgb(64 128 191)");
    expect(context.fills[0]?.alpha).toBeCloseTo(0.6);
  });
});
