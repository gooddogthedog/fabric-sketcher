import { describe, expect, it } from "vitest";
import type { HexColor } from "../../domain/document/types";
import { getBrushPreset } from "./presets";
import {
  BrushColorError,
  MAX_BRUSH_OPACITY,
  MAX_BRUSH_SIZE,
  MIN_BRUSH_OPACITY,
  MIN_BRUSH_SIZE,
  RECENT_COLOR_LIMIT,
  addRecentColor,
  resetBrushToPreset,
  setBrushColor,
  setBrushOpacity,
  setBrushSize,
} from "./brushEdits";

describe("brushEdits", () => {
  it("clamps size into the supported range and keeps preset identity", () => {
    const denim = getBrushPreset("denim-v1");

    expect(setBrushSize(denim, 1).size).toBe(MIN_BRUSH_SIZE);
    expect(setBrushSize(denim, 9000).size).toBe(MAX_BRUSH_SIZE);

    const resized = setBrushSize(denim, 64);
    expect(resized.size).toBe(64);
    expect(resized.id).toBe("denim-v1");
    expect(resized.texture).toEqual(denim.texture);
  });

  it("clamps opacity and keeps the current value for a non-finite request", () => {
    const silk = getBrushPreset("silk-v1");

    expect(setBrushOpacity(silk, 0).opacity).toBe(MIN_BRUSH_OPACITY);
    expect(setBrushOpacity(silk, 4).opacity).toBe(MAX_BRUSH_OPACITY);
    expect(setBrushOpacity(silk, Number.NaN).opacity).toBe(silk.opacity);
  });

  it("recolors without changing the characteristic texture", () => {
    const wool = getBrushPreset("wool-v1");
    const recolored = setBrushColor(wool, "#1B4B33");

    expect(recolored.color).toBe("#1b4b33");
    expect(recolored.texture).toEqual(wool.texture);
  });

  it("rejects a malformed color", () => {
    expect(() => setBrushColor(getBrushPreset("knit-v1"), "green")).toThrow(
      BrushColorError,
    );
  });

  it("restores every calibrated preset default", () => {
    const pencil = getBrushPreset("studio-pencil-v1");
    const edited = setBrushColor(
      setBrushOpacity(setBrushSize(pencil, 200), 0.1),
      "#123456",
    );

    expect(resetBrushToPreset(edited)).toEqual(pencil);
  });

  it("keeps the five most recent colors, newest first, without duplicates", () => {
    const entered: readonly HexColor[] = [
      "#111111",
      "#222222",
      "#333333",
      "#444444",
      "#555555",
      "#666666",
    ];
    const colors = entered.reduce<readonly HexColor[]>(
      (list, color) => addRecentColor(list, color),
      [],
    );

    expect(colors).toEqual([
      "#666666",
      "#555555",
      "#444444",
      "#333333",
      "#222222",
    ]);
    expect(colors).toHaveLength(RECENT_COLOR_LIMIT);
    expect(addRecentColor(colors, "#444444")).toEqual([
      "#444444",
      "#666666",
      "#555555",
      "#333333",
      "#222222",
    ]);
  });
});
