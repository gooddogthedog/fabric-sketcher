import type { PenSample } from "../../domain/document/types";

export type PointerEventLike = Readonly<{
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  pressure?: number | null;
  tiltX?: number | null;
  tiltY?: number | null;
  twist?: number | null;
  altitudeAngle?: number | null;
  azimuthAngle?: number | null;
  timeStamp: number;
  getCoalescedEvents?: () => readonly PointerEventLike[];
  getPredictedEvents?: () => readonly PointerEventLike[];
}>;

export type InputBatch = Readonly<{
  pointerId: number;
  pointerType: "pen" | "touch" | "mouse" | "unknown";
  phase: "down" | "move" | "up" | "cancel";
  confirmed: readonly PenSample[];
  predicted: readonly PenSample[];
}>;

export type SurfaceBounds = Readonly<{ left: number; top: number }>;
