import type { PenSample } from "../../domain/document/types";
import { transformPoint, type Matrix3 } from "../math/affine";
import {
  type InputBatch,
  type PointerEventLike,
  type SurfaceBounds,
} from "./types";

export type { PointerEventLike } from "./types";

type NormalizePointerEventOptions = Readonly<{
  phase: InputBatch["phase"];
  surfaceBounds: SurfaceBounds;
  inverseViewportMatrix: Matrix3;
}>;

export function normalizePointerEvent(
  event: PointerEventLike,
  options: NormalizePointerEventOptions,
): InputBatch {
  assertValidPhase(options.phase);

  const pointerType = normalizePointerType(event.pointerType);

  if (pointerType === "touch") {
    return {
      pointerId: event.pointerId,
      pointerType,
      phase: options.phase,
      confirmed: [],
      predicted: [],
    };
  }

  const coalescedEvents = event.getCoalescedEvents?.() ?? [];
  const confirmedEvents: PointerEventLike[] = [];
  let hasHostEvent = false;

  for (const coalescedEvent of coalescedEvents) {
    if (coalescedEvent === event) {
      if (hasHostEvent) {
        continue;
      }

      hasHostEvent = true;
    }

    confirmedEvents.push(coalescedEvent);
  }

  if (!hasHostEvent) {
    confirmedEvents.push(event);
  }

  confirmedEvents.sort((left, right) => left.timeStamp - right.timeStamp);

  return {
    pointerId: event.pointerId,
    pointerType,
    phase: options.phase,
    confirmed: confirmedEvents.map((sample) => toSample(sample, options)),
    predicted: (event.getPredictedEvents?.() ?? []).map((sample) =>
      toSample(sample, options),
    ),
  };
}

function assertValidPhase(phase: InputBatch["phase"]): void {
  if (
    phase === "down" ||
    phase === "move" ||
    phase === "up" ||
    phase === "cancel"
  ) {
    return;
  }

  throw new RangeError(`Unsupported pointer phase: "${phase}"`);
}

function normalizePointerType(pointerType: string): InputBatch["pointerType"] {
  switch (pointerType) {
    case "pen":
    case "touch":
    case "mouse":
      return pointerType;
    default:
      return "unknown";
  }
}

function toSample(
  event: PointerEventLike,
  options: NormalizePointerEventOptions,
): PenSample {
  const point = transformPoint(options.inverseViewportMatrix, {
    x: event.clientX - options.surfaceBounds.left,
    y: event.clientY - options.surfaceBounds.top,
  });

  return {
    x: point.x,
    y: point.y,
    pressure: clamp(
      event.pressure ?? (options.phase === "down" ? 0.5 : 0),
      0,
      1,
    ),
    tiltX: clamp(event.tiltX ?? 0, -90, 90),
    tiltY: clamp(event.tiltY ?? 0, -90, 90),
    twist: clamp(event.twist ?? 0, 0, 359),
    altitudeAngle: clampOptional(event.altitudeAngle, 0, Math.PI / 2),
    azimuthAngle: clampOptional(event.azimuthAngle, 0, 2 * Math.PI),
    time: event.timeStamp,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function clampOptional(
  value: number | null | undefined,
  minimum: number,
  maximum: number,
): number | null {
  return value == null ? null : clamp(value, minimum, maximum);
}
