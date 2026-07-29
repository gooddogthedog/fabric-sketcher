import { describe, expect, it } from "vitest";
import { identity } from "../../engine/math/affine";
import {
  createFoundationState,
  FoundationValidationError,
  normalizeFoundationState,
} from "./foundationState";

const seedFixture = {
  assetId: "neutral-figure-front",
  assetVersion: 1,
  foundationType: "figure" as const,
  visibleLandmarkGroups: ["outline", "center", "levels"] as const,
};

describe("foundation state", () => {
  it("creates an immutable, locked, faded, non-exporting default", () => {
    const state = createFoundationState(seedFixture);

    expect(state).toMatchObject({
      assetId: "neutral-figure-front",
      assetVersion: 1,
      foundationType: "figure",
      opacity: 0.35,
      visible: true,
      locked: true,
      includeInExport: false,
      transform: identity(),
    });
    expect(state.visibleLandmarkGroups).toEqual([
      "outline",
      "center",
      "levels",
    ]);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.transform)).toBe(true);
    expect(Object.isFrozen(state.visibleLandmarkGroups)).toBe(true);
  });

  it("rejects a singular or non-finite transform", () => {
    expect(() =>
      normalizeFoundationState({
        ...createFoundationState(seedFixture),
        transform: [0, 0, 0, 0, 0, 0, 0, 0, 1],
      }),
    ).toThrow(FoundationValidationError);
    expect(() =>
      normalizeFoundationState({
        ...createFoundationState(seedFixture),
        transform: [Number.NaN, 0, 0, 0, 1, 0, 0, 0, 1],
      }),
    ).toThrow(FoundationValidationError);
  });

  it("retains an unknown but well-formed asset reference", () => {
    expect(
      normalizeFoundationState({
        ...createFoundationState(seedFixture),
        assetId: "retired-foundation",
        assetVersion: 7,
      }).assetId,
    ).toBe("retired-foundation");
  });
});
