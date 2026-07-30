import { describe, expect, it } from "vitest";
import { setBrushSize } from "./brushEdits";
import { createEraserSnapshot } from "./eraser";
import { getBrushPreset } from "./presets";

describe("createEraserSnapshot", () => {
  it("takes the active brush tip shape and carries no color or texture", () => {
    const wool = setBrushSize(getBrushPreset("wool-v1"), 96);
    const eraser = createEraserSnapshot(wool);

    expect(eraser).toEqual({
      tipBrushId: "wool-v1",
      size: 96,
      opacity: wool.opacity,
      pressureSize: wool.pressureSize,
      pressureOpacity: wool.pressureOpacity,
      tiltShape: wool.tiltShape,
    });
    expect(Object.hasOwn(eraser, "color")).toBe(false);
    expect(Object.hasOwn(eraser, "texture")).toBe(false);
  });

  it("is frozen so an active contact cannot be mutated mid-stroke", () => {
    expect(
      Object.isFrozen(createEraserSnapshot(getBrushPreset("silk-v1"))),
    ).toBe(true);
  });
});
