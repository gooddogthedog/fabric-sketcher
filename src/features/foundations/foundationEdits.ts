import type { FoundationState } from "../../domain/document/types";
import {
  multiply,
  scale,
  transformPoint,
  translation,
} from "../../engine/math/affine";
import type { FoundationAsset } from "./types";

export function replaceFoundationAsset(
  current: FoundationState,
  asset: FoundationAsset,
): FoundationState {
  const supportedGroups = new Set(asset.groups.map((group) => group.id));
  return {
    ...current,
    assetId: asset.id,
    assetVersion: asset.version,
    foundationType: asset.foundationType,
    visibleLandmarkGroups: current.visibleLandmarkGroups.filter((group) =>
      supportedGroups.has(group),
    ),
  };
}

export function setFoundationScale(
  foundation: FoundationState,
  asset: FoundationAsset,
  scaleValue: number,
): FoundationState {
  const assetCenter = {
    x: asset.bounds.x + asset.bounds.width / 2,
    y: asset.bounds.y + asset.bounds.height / 2,
  };
  const transformedCenter = transformPoint(foundation.transform, assetCenter);
  const currentScale = Math.hypot(
    foundation.transform[0],
    foundation.transform[3],
  );
  const factor = scaleValue / currentScale;
  const aroundCenter = multiply(
    translation(transformedCenter.x, transformedCenter.y),
    multiply(
      scale(factor),
      translation(-transformedCenter.x, -transformedCenter.y),
    ),
  );
  return {
    ...foundation,
    transform: multiply(aroundCenter, foundation.transform),
  };
}

export function flipFoundation(
  foundation: FoundationState,
  asset: FoundationAsset,
): FoundationState {
  const flipAroundCenterLine = multiply(
    translation(asset.centerLineX, 0),
    multiply(scale(-1, 1), translation(-asset.centerLineX, 0)),
  );
  return {
    ...foundation,
    transform: multiply(foundation.transform, flipAroundCenterLine),
  };
}
