import { describe, expect, it } from "vitest";
import { createTextureTile, textureCacheKey } from "./createTextureTile";
import type { RenderColor, RenderTexture } from "./Renderer";

class FakeTileContext {
  public fillStyle = "";
  public readonly operations: string[] = [];
  public readonly arcStarts: number[] = [];

  public fillRect(x: number, y: number, width: number, height: number): void {
    this.operations.push(`rect:${this.fillStyle}:${x},${y},${width},${height}`);
  }
  public beginPath(): void {
    this.operations.push("begin");
  }
  public moveTo(x: number, y: number): void {
    this.operations.push(`move:${x},${y}`);
  }
  public lineTo(x: number, y: number): void {
    this.operations.push(`line:${x},${y}`);
  }
  public arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
  ): void {
    this.arcStarts.push(startAngle);
    this.operations.push(`arc:${x},${y},${radius},${startAngle},${endAngle}`);
  }
  public stroke(): void {
    this.operations.push("stroke");
  }

  public asContext(): CanvasRenderingContext2D {
    return this as unknown as CanvasRenderingContext2D;
  }
}

class FakeCanvas {
  public width = 0;
  public height = 0;
  public readonly context = new FakeTileContext();

  public getContext(kind: "2d"): CanvasRenderingContext2D | null {
    return kind === "2d" ? this.context.asContext() : null;
  }

  public asCanvas(): HTMLCanvasElement {
    return this as unknown as HTMLCanvasElement;
  }
}

class FakeCanvasDocument {
  public readonly canvases: FakeCanvas[] = [];

  public createElement(tagName: "canvas"): HTMLCanvasElement {
    void tagName;
    const canvas = new FakeCanvas();
    this.canvases.push(canvas);
    return canvas.asCanvas();
  }

  public asDocument(): Pick<Document, "createElement"> {
    return this as unknown as Pick<Document, "createElement">;
  }
}

const color: RenderColor = [0.25, 0.5, 0.75, 0.8];

function texture(kind: RenderTexture["kind"], scale = 38): RenderTexture {
  return { kind, scale, strength: 0.62, angle: 42, scatter: 0.28 };
}

function plan(
  document: FakeCanvasDocument,
  kind: RenderTexture["kind"],
): string {
  createTextureTile(document.asDocument(), color, texture(kind));
  return document.canvases[0]?.context.operations.join("|") ?? "";
}

describe("createTextureTile", () => {
  it("returns the same cache key for identical texture inputs", () => {
    expect(textureCacheKey(color, texture("denim"))).toBe(
      textureCacheKey(color, texture("denim")),
    );
  });

  it("keeps distinct texture values in separate cache keys", () => {
    expect(textureCacheKey(color, texture("denim"))).not.toBe(
      textureCacheKey(color, { ...texture("denim"), angle: 42.0001 }),
    );
  });

  it("creates a distinct, deterministic drawing plan for every texture kind", () => {
    const kinds: readonly RenderTexture["kind"][] = [
      "graphite",
      "silk",
      "denim",
      "wool",
      "knit",
    ];
    const plans = kinds.map((kind) => plan(new FakeCanvasDocument(), kind));

    expect(plans).not.toContain("");
    expect(new Set(plans).size).toBe(5);
    expect(plan(new FakeCanvasDocument(), "wool")).toBe(plans[3]);
  });

  it("bounds physical tile dimensions for extreme texture scales", () => {
    const smallDocument = new FakeCanvasDocument();
    const largeDocument = new FakeCanvasDocument();
    const small = createTextureTile(
      smallDocument.asDocument(),
      color,
      texture("graphite", 1),
    );
    const large = createTextureTile(
      largeDocument.asDocument(),
      color,
      texture("graphite", 1000),
    );

    expect([small.width, small.height, large.width, large.height]).toEqual([
      16, 16, 128, 128,
    ]);
  });

  it("rotates knit loop arcs by the texture angle", () => {
    const document = new FakeCanvasDocument();
    createTextureTile(document.asDocument(), color, {
      ...texture("knit"),
      angle: 45,
    });

    expect(document.canvases[0]?.context.arcStarts[0]).toBeCloseTo(Math.PI / 4);
  });
});
