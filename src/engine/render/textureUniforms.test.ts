import { describe, expect, it } from "vitest";
import { getBrushPreset } from "../brush/presets";
import type { RenderTexture } from "./Renderer";
import { textureUniforms } from "./textureUniforms";

describe("textureUniforms", () => {
  it.each([
    ["studio-pencil-v1", 0, 18, 0.34, 0, 0.18],
    ["silk-v1", 1, 84, 0.3, -0.20943951023931956, 0.06],
    ["denim-v1", 2, 38, 0.62, 0.7330382858376184, 0.12],
    ["wool-v1", 3, 26, 0.58, 0.13962634015954636, 0.72],
    ["knit-v1", 4, 62, 0.54, 0, 0.16],
  ] as const)(
    "maps %s to its stable shader kind and calibrated numeric uniforms",
    (presetId, kind, scale, strength, angleRadians, scatter) => {
      expect(textureUniforms(getBrushPreset(presetId).texture)).toEqual({
        kind,
        scale,
        strength,
        angleRadians,
        scatter,
      });
    },
  );

  it("returns finite shader-safe values for malformed runtime numbers", () => {
    const uniforms = textureUniforms({
      kind: "wool",
      scale: Number.NaN,
      strength: Number.POSITIVE_INFINITY,
      angle: Number.NEGATIVE_INFINITY,
      scatter: 4,
    } satisfies RenderTexture);

    expect(Object.values(uniforms).every(Number.isFinite)).toBe(true);
    expect(uniforms.scale).toBeGreaterThanOrEqual(0.001);
    expect(uniforms.strength).toBeGreaterThanOrEqual(0);
    expect(uniforms.strength).toBeLessThanOrEqual(1);
    expect(uniforms.scatter).toBe(1);
  });

  it("clamps finite texture parameters before they reach the shader", () => {
    expect(
      textureUniforms({
        kind: "graphite",
        scale: -12,
        strength: -0.25,
        angle: 1080,
        scatter: -4,
      }),
    ).toEqual({
      kind: 0,
      scale: 0.001,
      strength: 0,
      angleRadians: 0,
      scatter: 0,
    });
  });
});
