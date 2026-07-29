import { identity, type Matrix3 } from "../../engine/math/affine";
import type {
  FoundationLandmarkGroup,
  FoundationState,
  FoundationStateSeed,
  FoundationType,
} from "./types";

const FOUNDATION_GROUPS = new Set<FoundationLandmarkGroup>([
  "outline",
  "center",
  "levels",
  "construction",
]);

export class FoundationValidationError extends Error {
  constructor() {
    super("Invalid foundation state.");
    this.name = "FoundationValidationError";
  }
}

export function createFoundationState(
  seed: FoundationStateSeed,
): FoundationState {
  return freezeFoundation({
    ...seed,
    transform: identity(),
    opacity: 0.34,
    visible: true,
    locked: true,
    includeInExport: false,
  });
}

export function normalizeFoundationState(value: unknown): FoundationState {
  if (
    !isRecord(value) ||
    typeof value.assetId !== "string" ||
    value.assetId.length === 0 ||
    !isPositiveInteger(value.assetVersion) ||
    !isFoundationType(value.foundationType) ||
    !isAffineMatrix(value.transform) ||
    !isUnitInterval(value.opacity) ||
    typeof value.visible !== "boolean" ||
    !isLandmarkGroups(value.visibleLandmarkGroups) ||
    typeof value.locked !== "boolean" ||
    typeof value.includeInExport !== "boolean"
  ) {
    throw new FoundationValidationError();
  }

  return freezeFoundation({
    assetId: value.assetId,
    assetVersion: value.assetVersion,
    foundationType: value.foundationType,
    transform: value.transform,
    opacity: value.opacity,
    visible: value.visible,
    visibleLandmarkGroups: value.visibleLandmarkGroups,
    locked: value.locked,
    includeInExport: value.includeInExport,
  });
}

export function immutableFoundation(
  foundation: FoundationState | null,
): FoundationState | null {
  if (foundation === null) {
    return null;
  }

  return freezeFoundation(foundation);
}

function freezeFoundation(foundation: FoundationState): FoundationState {
  return Object.freeze({
    ...foundation,
    transform: freezeMatrix(foundation.transform),
    visibleLandmarkGroups: Object.freeze([...foundation.visibleLandmarkGroups]),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isUnitInterval(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function isFoundationType(value: unknown): value is FoundationType {
  return value === "figure" || value === "dress-form";
}

function isLandmarkGroups(
  value: unknown,
): value is readonly FoundationLandmarkGroup[] {
  return Array.isArray(value) && value.every(isFoundationLandmarkGroup);
}

function isFoundationLandmarkGroup(
  value: unknown,
): value is FoundationLandmarkGroup {
  return (
    (value === "outline" ||
      value === "center" ||
      value === "levels" ||
      value === "construction") &&
    FOUNDATION_GROUPS.has(value)
  );
}

function isAffineMatrix(value: unknown): value is Matrix3 {
  return (
    Array.isArray(value) &&
    value.length === 9 &&
    value.every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    ) &&
    value[6] === 0 &&
    value[7] === 0 &&
    value[8] === 1 &&
    Math.abs(value[0] * value[4] - value[1] * value[3]) > 1e-9
  );
}

function freezeMatrix(matrix: Matrix3): Matrix3 {
  return Object.freeze([
    matrix[0],
    matrix[1],
    matrix[2],
    matrix[3],
    matrix[4],
    matrix[5],
    matrix[6],
    matrix[7],
    matrix[8],
  ]);
}
