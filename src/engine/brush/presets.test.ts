import { describe, expect, it } from "vitest";
import {
  BRUSH_PRESETS,
  DEFAULT_BRUSH_ID,
  getBrushPreset,
  isBrushPresetId,
} from "./presets";

describe("fabric brush presets", () => {
  it("exposes the five calibrated presets in stable order", () => {
    expect(BRUSH_PRESETS.map(({ id }) => id)).toEqual([
      "studio-pencil-v1",
      "silk-v1",
      "denim-v1",
      "wool-v1",
      "knit-v1",
    ]);
    expect(DEFAULT_BRUSH_ID).toBe("studio-pencil-v1");
  });

  it("returns deeply frozen snapshots from catalog IDs only", () => {
    const denim = getBrushPreset("denim-v1");

    expect(denim).toEqual({
      id: "denim-v1",
      color: "#294F68",
      opacity: 0.74,
      size: 42,
      pressureSize: 0.72,
      pressureOpacity: 0.28,
      tiltShape: 0.16,
      texture: {
        kind: "denim",
        scale: 38,
        strength: 0.62,
        angle: 42,
        scatter: 0.12,
      },
    });
    expect(Object.isFrozen(denim)).toBe(true);
    expect(Object.isFrozen(denim.texture)).toBe(true);
    expect(isBrushPresetId("knit-v1")).toBe(true);
    expect(isBrushPresetId("paint-v1")).toBe(false);
    expect(isBrushPresetId("toString")).toBe(false);
  });
});
