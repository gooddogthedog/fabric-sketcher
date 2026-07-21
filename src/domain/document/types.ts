export type Point = Readonly<{ x: number; y: number }>;

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

export type DocumentOperation = StrokeOperation | StrokeVisibilityOperation;

export type DesignDocument = Readonly<{
  schemaVersion: 1;
  projectId: string;
  title: string;
  width: number;
  height: number;
  background: "#F7F3EC";
  activeLayerId: string;
  operationSequence: number;
  strokes: readonly StrokeOperation[];
  hiddenStrokeIds: readonly string[];
}>;
