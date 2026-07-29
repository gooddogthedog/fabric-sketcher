import type { Matrix3 } from "../../engine/math/affine";

export type Point = Readonly<{ x: number; y: number }>;

export type FoundationType = "figure" | "dress-form";

export type FoundationLandmarkGroup =
  "outline" | "center" | "levels" | "construction";

export type FoundationState = Readonly<{
  assetId: string;
  assetVersion: number;
  foundationType: FoundationType;
  transform: Matrix3;
  opacity: number;
  visible: boolean;
  visibleLandmarkGroups: readonly FoundationLandmarkGroup[];
  locked: boolean;
  includeInExport: boolean;
}>;

export type FoundationStateSeed = Readonly<{
  assetId: string;
  assetVersion: number;
  foundationType: FoundationType;
  visibleLandmarkGroups: readonly FoundationLandmarkGroup[];
}>;

export type PenSample = Readonly<{
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
  altitudeAngle: number | null;
  azimuthAngle: number | null;
  time: number;
}>;

export type BrushPresetId =
  "studio-pencil-v1" | "silk-v1" | "denim-v1" | "wool-v1" | "knit-v1";

export type BrushTextureKind = "graphite" | "silk" | "denim" | "wool" | "knit";

export type BrushTextureSnapshot = Readonly<{
  kind: BrushTextureKind;
  scale: number;
  strength: number;
  angle: number;
  scatter: number;
}>;

export type BrushSnapshot = Readonly<{
  id: BrushPresetId;
  color: `#${string}`;
  opacity: number;
  size: number;
  pressureSize: number;
  pressureOpacity: number;
  tiltShape: number;
  texture: BrushTextureSnapshot;
}>;

export type StrokeOperation = Readonly<{
  type: "stroke.committed";
  operationId: string;
  projectId: string;
  layerId: string;
  sequence: number;
  committedAt: string;
  brush: BrushSnapshot;
  samples: readonly PenSample[];
}>;

export type StrokeVisibilityOperation = Readonly<{
  type: "stroke.visibility-set";
  operationId: string;
  projectId: string;
  sequence: number;
  committedAt: string;
  targetOperationId: string;
  visible: boolean;
}>;

export type FoundationSetOperation = Readonly<{
  type: "foundation.set";
  operationId: string;
  projectId: string;
  sequence: number;
  committedAt: string;
  foundation: FoundationState | null;
}>;

export type DocumentTitleSetOperation = Readonly<{
  type: "document.title-set";
  operationId: string;
  projectId: string;
  sequence: number;
  committedAt: string;
  title: string;
}>;

export type DocumentOperation =
  | StrokeOperation
  | StrokeVisibilityOperation
  | FoundationSetOperation
  | DocumentTitleSetOperation;

export type DesignDocument = Readonly<{
  schemaVersion: 2;
  projectId: string;
  title: string;
  width: number;
  height: number;
  background: "#F7F3EC";
  activeLayerId: string;
  operationSequence: number;
  foundation: FoundationState | null;
  strokes: readonly StrokeOperation[];
  hiddenStrokeIds: readonly string[];
}>;
