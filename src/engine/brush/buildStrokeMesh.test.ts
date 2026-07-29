import { describe, expect, it } from "vitest";
import type { BrushSnapshot, PenSample } from "../../domain/document/types";
import * as strokeMesh from "./buildStrokeMesh";

const { buildStrokeMesh } = strokeMesh;

const brush: BrushSnapshot = {
  id: "studio-pencil-v1",
  color: "#123456",
  opacity: 0.8,
  size: 12,
  pressureSize: 1,
  pressureOpacity: 1,
  tiltShape: 0,
  texture: {
    kind: "graphite",
    scale: 18,
    strength: 0.34,
    angle: 0,
    scatter: 0.18,
  },
};

function sample(overrides: Partial<PenSample> = {}): PenSample {
  return {
    x: 0,
    y: 0,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    altitudeAngle: null,
    azimuthAngle: null,
    time: 0,
    ...overrides,
  };
}

describe("buildStrokeMesh", () => {
  it("returns an empty mesh for fewer than two samples", () => {
    expect(buildStrokeMesh([], brush)).toEqual(new Float32Array());
    expect(buildStrokeMesh([sample()], brush)).toEqual(new Float32Array());
  });

  it("increases width monotonically between the configured pressure bounds", () => {
    const mesh = buildStrokeMesh(
      [-1, 0, 0.5, 1, 2].map((pressure, index) =>
        sample({ x: index * 10, pressure, time: index }),
      ),
      { ...brush, size: 10, pressureSize: 0.8 },
    );
    const widths = Array.from({ length: 5 }, (_, index) => {
      const offset = index * 6;
      return Math.hypot(
        mesh[offset]! - mesh[offset + 3]!,
        mesh[offset + 1]! - mesh[offset + 4]!,
      );
    });

    expect(widths).toEqual([2, 2, 6, 10, 10]);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
  });

  it("changes vertex alpha with pressure without changing the source color", () => {
    const pressureBrush = {
      ...brush,
      pressureSize: 0,
      pressureOpacity: 0.5,
    } as const;
    const mesh = buildStrokeMesh(
      [
        sample({ x: 0, pressure: 0 }),
        sample({ x: 10, pressure: 0.5 }),
        sample({ x: 20, pressure: 1 }),
      ],
      pressureBrush,
    );

    expect([mesh[2], mesh[8], mesh[14]]).toEqual([
      expect.closeTo(0.4),
      expect.closeTo(0.6),
      expect.closeTo(0.8),
    ]);
    expect([mesh[2], mesh[5], mesh[8], mesh[11], mesh[14], mesh[17]]).toEqual([
      expect.closeTo(0.4),
      expect.closeTo(0.4),
      expect.closeTo(0.6),
      expect.closeTo(0.6),
      expect.closeTo(0.8),
      expect.closeTo(0.8),
    ]);
    expect(pressureBrush.color).toBe("#123456");
  });

  it("elongates the nib across the detected tilt axis only when enabled", () => {
    const tiltedSamples = [0, 10, 20].map((x, time) =>
      sample({ x, pressure: 1, tiltY: 45, time }),
    );
    const disabled = buildStrokeMesh(tiltedSamples, {
      ...brush,
      size: 10,
      pressureSize: 0,
      tiltShape: 0,
    });
    const enabled = buildStrokeMesh(tiltedSamples, {
      ...brush,
      size: 10,
      pressureSize: 0,
      tiltShape: 1,
    });
    const zeroTilt = buildStrokeMesh(
      tiltedSamples.map((point) => ({ ...point, tiltY: 0 })),
      { ...brush, size: 10, pressureSize: 0, tiltShape: 1 },
    );

    expect([disabled[6], disabled[9]]).toEqual([10, 10]);
    expect([enabled[6], enabled[9]]).toEqual([10, 10]);
    expect([enabled[7], enabled[10]]).toEqual([7.5, -7.5]);
    expect(zeroTilt).toEqual(disabled);
  });

  it("treats positive and negative Y tilt as the same non-collapsing axis on a horizontal stroke", () => {
    const makeMesh = (tiltY: number) =>
      buildStrokeMesh(
        [0, 10, 20].map((x, time) => sample({ x, pressure: 1, tiltY, time })),
        { ...brush, size: 10, pressureSize: 0, tiltShape: 1 },
      );
    const positive = makeMesh(90);
    const negative = makeMesh(-90);
    const crossStrokeExtent = Math.abs(positive[7]! - positive[10]!);

    expect(negative).toEqual(positive);
    expect(crossStrokeExtent).toBeGreaterThanOrEqual(10);
    expect(Math.hypot(positive[6]! - positive[9]!, crossStrokeExtent)).toBe(20);
  });

  it("treats positive and negative X tilt as the same non-collapsing axis on a vertical stroke", () => {
    const makeMesh = (tiltX: number) =>
      buildStrokeMesh(
        [0, 10, 20].map((y, time) => sample({ y, pressure: 1, tiltX, time })),
        { ...brush, size: 10, pressureSize: 0, tiltShape: 1 },
      );
    const positive = makeMesh(90);
    const negative = makeMesh(-90);
    const crossStrokeExtent = Math.abs(positive[6]! - positive[9]!);

    expect(negative).toEqual(positive);
    expect(crossStrokeExtent).toBeGreaterThanOrEqual(10);
    expect(Math.hypot(crossStrokeExtent, positive[7]! - positive[10]!)).toBe(
      20,
    );
  });

  it("keeps signed diagonal tilt axes symmetric without reducing base cross-stroke extent", () => {
    const makeMesh = (tiltX: number, tiltY: number) =>
      buildStrokeMesh(
        [0, 10, 20].map((x, time) =>
          sample({ x, pressure: 1, tiltX, tiltY, time }),
        ),
        { ...brush, size: 10, pressureSize: 0, tiltShape: 1 },
      );

    for (const [tiltX, tiltY] of [
      [45, 45],
      [45, -45],
    ] as const) {
      const positive = makeMesh(tiltX, tiltY);
      const negative = makeMesh(-tiltX, -tiltY);
      const crossStrokeExtent = Math.abs(positive[7]! - positive[10]!);
      const edgeDistance = Math.hypot(
        positive[6]! - positive[9]!,
        positive[7]! - positive[10]!,
      );

      expect(negative).toEqual(positive);
      expect(crossStrokeExtent).toBeGreaterThanOrEqual(10);
      expect(edgeDistance).toBeGreaterThan(0);
    }
  });

  it("uses finite neighboring normals for identical points and zero-time intervals", () => {
    const mesh = buildStrokeMesh(
      [
        sample({ x: 0, y: 0, pressure: 1, time: 10 }),
        sample({ x: 0, y: 0, pressure: 1, time: 10 }),
        sample({ x: 10, y: 10, pressure: 1, time: 10 }),
      ],
      { ...brush, size: 10, pressureSize: 0, tiltShape: 0 },
    );

    expect(Array.from(mesh).every(Number.isFinite)).toBe(true);
    expect(mesh[0]).toBeCloseTo(-Math.SQRT1_2 * 5);
    expect(mesh[1]).toBeCloseTo(Math.SQRT1_2 * 5);
    expect(mesh[3]).toBeCloseTo(Math.SQRT1_2 * 5);
    expect(mesh[4]).toBeCloseTo(-Math.SQRT1_2 * 5);
  });

  it("stabilizes confirmed points while preserving the live tail and frozen inputs", () => {
    const samples = Object.freeze(
      [0, 10, 0, 10, 3].map((y, index) =>
        Object.freeze(sample({ x: index * 10, y, time: index })),
      ),
    );
    const frozenBrush = Object.freeze({ ...brush });
    const before = JSON.stringify({ samples, brush: frozenBrush });
    const mesh = buildStrokeMesh(samples, frozenBrush);
    const centerY = (index: number) =>
      (mesh[index * 6 + 1]! + mesh[index * 6 + 4]!) / 2;

    expect(centerY(2)).toBeCloseTo(4.6);
    expect(centerY(3)).toBeCloseTo(13 / 3);
    expect(centerY(4)).toBeCloseTo(3);
    expect(JSON.stringify({ samples, brush: frozenBrush })).toBe(before);
  });

  it("builds a 10,000-sample strip inside the algorithmic regression budget", () => {
    const samples = Array.from({ length: 10_000 }, (_, index) =>
      sample({
        x: index,
        y: Math.sin(index / 20) * 10,
        pressure: (index % 101) / 100,
        time: index,
      }),
    );
    const startedAt = performance.now();
    const mesh = buildStrokeMesh(samples, brush);
    const elapsedMs = performance.now() - startedAt;
    const vertexStride = (
      strokeMesh as { readonly STROKE_VERTEX_STRIDE?: number }
    ).STROKE_VERTEX_STRIDE;

    console.info(`buildStrokeMesh 10k: ${elapsedMs.toFixed(2)}ms`);
    expect(vertexStride).toBe(3);
    expect(mesh).toHaveLength(samples.length * 2 * (vertexStride ?? 0));
    expect(elapsedMs).toBeLessThan(1_000);
  });
});
