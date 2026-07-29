import { describe, expect, it } from "vitest";
import { createFoundationState } from "../../domain/document/foundationState";
import { transformPoint, type Matrix3 } from "../../engine/math/affine";
import { getFoundationAsset } from "./foundationCatalog";
import {
  flipFoundation,
  replaceFoundationAsset,
  setFoundationScale,
} from "./foundationEdits";

const figure = getFoundationAsset("neutral-figure-front", 1)!;
const dressForm = getFoundationAsset("dress-form-front", 1)!;

describe("foundation edits", () => {
  it("preserves placement and compatible presentation when switching assets", () => {
    const transform: Matrix3 = [1.2, 0, 180, 0, 1.2, -40, 0, 0, 1];
    const placedFigure = {
      ...createFoundationState({
        assetId: figure.id,
        assetVersion: figure.version,
        foundationType: figure.foundationType,
        visibleLandmarkGroups: ["outline", "center", "construction"],
      }),
      transform,
      opacity: 0.6,
      visible: false,
      locked: false,
      includeInExport: true,
    };

    expect(replaceFoundationAsset(placedFigure, dressForm)).toEqual({
      ...placedFigure,
      assetId: "dress-form-front",
      assetVersion: 1,
      foundationType: "dress-form",
      visibleLandmarkGroups: ["outline", "center", "construction"],
    });
  });

  it("scales around the transformed asset center", () => {
    const foundation = {
      ...createFoundationState({
        assetId: figure.id,
        assetVersion: figure.version,
        foundationType: figure.foundationType,
        visibleLandmarkGroups: ["outline"],
      }),
      transform: [2, 0, 75, 0, 2, -30, 0, 0, 1] as Matrix3,
    };
    const assetCenter = {
      x: figure.bounds.x + figure.bounds.width / 2,
      y: figure.bounds.y + figure.bounds.height / 2,
    };
    const centerBefore = transformPoint(foundation.transform, assetCenter);

    const scaled = setFoundationScale(foundation, figure, 3);

    expect(Math.hypot(scaled.transform[0], scaled.transform[3])).toBeCloseTo(3);
    expect(transformPoint(scaled.transform, assetCenter)).toEqual(centerBefore);
  });

  it("flips around the asset center line without moving its on-screen center", () => {
    const foundation = {
      ...createFoundationState({
        assetId: figure.id,
        assetVersion: figure.version,
        foundationType: figure.foundationType,
        visibleLandmarkGroups: ["outline"],
      }),
      transform: [1.5, 0, 120, 0, 1.5, 80, 0, 0, 1] as Matrix3,
    };
    const center = { x: figure.centerLineX, y: 1900 };
    const centerBefore = transformPoint(foundation.transform, center);

    const flipped = flipFoundation(foundation, figure);

    expect(transformPoint(flipped.transform, center)).toEqual(centerBefore);
    expect(flipped.transform[0]).toBe(-1.5);
    expect(flipFoundation(flipped, figure).transform).toEqual(
      foundation.transform,
    );
  });
});
