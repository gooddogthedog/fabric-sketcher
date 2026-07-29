import { describe, expect, it } from "vitest";
import {
  createDefaultFoundationState,
  getFoundationAsset,
  getFoundationAssets,
} from "./foundationCatalog";

describe("foundation catalog", () => {
  it("returns immutable front-view assets in editorial order", () => {
    const assets = getFoundationAssets();

    expect(assets.map(({ id, version }) => [id, version])).toEqual([
      ["neutral-figure-front", 1],
      ["dress-form-front", 1],
    ]);
    expect(
      assets.map(({ foundationType, view }) => [foundationType, view]),
    ).toEqual([
      ["figure", "front"],
      ["dress-form", "front"],
    ]);
    expect(Object.isFrozen(assets)).toBe(true);
    for (const asset of assets) {
      expect(Object.isFrozen(asset)).toBe(true);
      expect(Object.isFrozen(asset.viewBox)).toBe(true);
      expect(Object.isFrozen(asset.bounds)).toBe(true);
      expect(Object.isFrozen(asset.groups)).toBe(true);
      expect(asset.groups.every(Object.isFrozen)).toBe(true);
    }
  });

  it("looks up an exact pinned asset version", () => {
    expect(getFoundationAsset("neutral-figure-front", 1)).toMatchObject({
      name: "Neutral figure — Front",
      sourceUrl: "/foundations/neutral-figure-front-v1.svg",
      viewBox: { x: 0, y: 0, width: 2480, height: 3508 },
      bounds: { x: 690, y: 170, width: 1100, height: 3160 },
      centerLineX: 1240,
    });
    expect(getFoundationAsset("dress-form-front", 1)).toMatchObject({
      name: "Professional dress form — Front",
      sourceUrl: "/foundations/dress-form-front-v1.svg",
      viewBox: { x: 0, y: 0, width: 2480, height: 3508 },
      bounds: { x: 760, y: 360, width: 960, height: 2780 },
      centerLineX: 1240,
    });
  });

  it("returns null for an unavailable pinned version", () => {
    expect(getFoundationAsset("neutral-figure-front", 99)).toBeNull();
    expect(getFoundationAsset("retired-foundation", 1)).toBeNull();
  });

  it("creates a default state from the asset's visible groups", () => {
    const asset = getFoundationAsset("dress-form-front", 1);
    expect(asset).not.toBeNull();

    const state = createDefaultFoundationState(asset!);

    expect(state).toMatchObject({
      assetId: "dress-form-front",
      assetVersion: 1,
      foundationType: "dress-form",
      visibleLandmarkGroups: ["outline", "center", "levels"],
      opacity: 0.34,
      visible: true,
      locked: true,
      includeInExport: false,
    });
    expect(Object.isFrozen(state)).toBe(true);
  });
});
