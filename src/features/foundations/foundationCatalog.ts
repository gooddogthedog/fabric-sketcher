import { createFoundationState } from "../../domain/document/foundationState";
import type {
  FoundationLandmarkGroup,
  FoundationState,
  FoundationType,
} from "../../domain/document/types";
import type { FoundationAsset, FoundationView } from "./types";

type FoundationGroup = Readonly<{
  id: FoundationLandmarkGroup;
  label: string;
  symbolId: string;
  defaultVisible: boolean;
}>;

const figureGroups: readonly FoundationGroup[] = Object.freeze([
  Object.freeze({
    id: "outline",
    label: "Figure outline",
    symbolId: "foundation-outline",
    defaultVisible: true,
  }),
  Object.freeze({
    id: "center",
    label: "Center front",
    symbolId: "foundation-center",
    defaultVisible: true,
  }),
  Object.freeze({
    id: "levels",
    label: "Body levels",
    symbolId: "foundation-levels",
    defaultVisible: true,
  }),
  Object.freeze({
    id: "construction",
    label: "Construction",
    symbolId: "foundation-construction",
    defaultVisible: false,
  }),
]);

const dressFormGroups: readonly FoundationGroup[] = Object.freeze([
  Object.freeze({
    id: "outline",
    label: "Form outline",
    symbolId: "foundation-outline",
    defaultVisible: true,
  }),
  Object.freeze({
    id: "center",
    label: "Center front",
    symbolId: "foundation-center",
    defaultVisible: true,
  }),
  Object.freeze({
    id: "levels",
    label: "Form levels",
    symbolId: "foundation-levels",
    defaultVisible: true,
  }),
  Object.freeze({
    id: "construction",
    label: "Construction",
    symbolId: "foundation-construction",
    defaultVisible: false,
  }),
]);

const frontView: FoundationView = "front";
const figureType: FoundationType = "figure";
const dressFormType: FoundationType = "dress-form";

export const FOUNDATION_ASSETS: readonly FoundationAsset[] = Object.freeze([
  Object.freeze({
    id: "neutral-figure-front",
    version: 1,
    name: "Neutral figure — Front",
    foundationType: figureType,
    view: frontView,
    sourceUrl: "/foundations/neutral-figure-front-v1.svg",
    viewBox: Object.freeze({ x: 0, y: 0, width: 2480, height: 3508 }),
    bounds: Object.freeze({ x: 690, y: 170, width: 1100, height: 3160 }),
    centerLineX: 1240,
    groups: figureGroups,
  }),
  Object.freeze({
    id: "dress-form-front",
    version: 1,
    name: "Professional dress form — Front",
    foundationType: dressFormType,
    view: frontView,
    sourceUrl: "/foundations/dress-form-front-v1.svg",
    viewBox: Object.freeze({ x: 0, y: 0, width: 2480, height: 3508 }),
    bounds: Object.freeze({ x: 760, y: 360, width: 960, height: 2780 }),
    centerLineX: 1240,
    groups: dressFormGroups,
  }),
]);

export function getFoundationAsset(
  assetId: string,
  assetVersion: number,
): FoundationAsset | null {
  return (
    FOUNDATION_ASSETS.find(
      (asset) => asset.id === assetId && asset.version === assetVersion,
    ) ?? null
  );
}

export function getFoundationAssets(): readonly FoundationAsset[] {
  return FOUNDATION_ASSETS;
}

export function createDefaultFoundationState(
  asset: FoundationAsset,
): FoundationState {
  return createFoundationState({
    assetId: asset.id,
    assetVersion: asset.version,
    foundationType: asset.foundationType,
    visibleLandmarkGroups: asset.groups
      .filter((group) => group.defaultVisible)
      .map((group) => group.id),
  });
}
