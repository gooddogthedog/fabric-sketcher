import type { FoundationState } from "../../domain/document/types";
import {
  multiply,
  scale,
  transformPoint,
  translation,
  type Matrix3,
  type Point2D,
} from "../../engine/math/affine";

export type FoundationTransformControllerOptions = Readonly<{
  surface: SVGSVGElement;
  getFoundation: () => FoundationState | null;
  getInverseViewport: () => Matrix3;
  previewTransform: (transform: Matrix3 | null) => void;
  commitTransform: (transform: Matrix3) => void | PromiseLike<void>;
}>;

export type FoundationTransformController = Readonly<{
  dispose(): void;
}>;

type DocumentContact = Readonly<{
  pointerId: number;
  pointerType: "pen" | "touch";
  point: Point2D;
}>;

const minimumFoundationScale = 0.25;
const maximumFoundationScale = 4;
const listenerOptions: AddEventListenerOptions = Object.freeze({
  passive: false,
});

export function createFoundationTransformController(
  options: FoundationTransformControllerOptions,
): FoundationTransformController {
  const { surface } = options;
  const contacts = new Map<number, DocumentContact>();
  let baselineContacts = new Map<number, DocumentContact>();
  let baselineTransform: Matrix3 | null = null;
  let preview: Matrix3 | null = null;
  let ownerType: DocumentContact["pointerType"] | null = null;
  let disposed = false;

  const snapshotBaseline = (transform: Matrix3) => {
    baselineTransform = [...transform] as Matrix3;
    baselineContacts = new Map(contacts);
  };

  const updatePreview = () => {
    if (!baselineTransform || contacts.size === 0) {
      return;
    }
    const next =
      contacts.size === 2 && ownerType === "touch"
        ? pinchTransform(contacts, baselineContacts, baselineTransform)
        : contactTranslation(contacts, baselineContacts, baselineTransform);
    if (!next) {
      return;
    }
    preview = next;
    options.previewTransform(next);
  };

  const clearGesture = (lostPointerId: number | null = null) => {
    const acceptedPointerIds = [...contacts.keys()];
    contacts.clear();
    baselineContacts.clear();
    baselineTransform = null;
    preview = null;
    ownerType = null;
    options.previewTransform(null);
    for (const pointerId of acceptedPointerIds) {
      if (pointerId !== lostPointerId) {
        releasePointer(surface, pointerId);
      }
    }
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "pen" && event.pointerType !== "touch") {
      return;
    }
    const foundation = options.getFoundation();
    if (!foundation || foundation.locked) {
      return;
    }
    const pointerType = event.pointerType;
    const firstContact = contacts.size === 0;
    const acceptsAdditionalTouch =
      ownerType === "touch" && pointerType === "touch" && contacts.size === 1;
    if (!firstContact && !acceptsAdditionalTouch) {
      return;
    }

    event.preventDefault();
    contacts.set(event.pointerId, toDocumentContact(event, surface, options));
    capturePointer(surface, event.pointerId);
    if (firstContact) {
      ownerType = pointerType;
      snapshotBaseline(foundation.transform);
    } else {
      snapshotBaseline(preview ?? baselineTransform ?? foundation.transform);
    }
  };

  const handlePointerMove = (event: PointerEvent) => {
    const existing = contacts.get(event.pointerId);
    if (!existing || existing.pointerType !== event.pointerType) {
      return;
    }
    event.preventDefault();
    contacts.set(event.pointerId, toDocumentContact(event, surface, options));
    updatePreview();
  };

  const handlePointerUp = (event: PointerEvent) => {
    const existing = contacts.get(event.pointerId);
    if (!existing || existing.pointerType !== event.pointerType) {
      return;
    }
    event.preventDefault();
    contacts.set(event.pointerId, toDocumentContact(event, surface, options));
    updatePreview();
    releasePointer(surface, event.pointerId);
    contacts.delete(event.pointerId);

    if (contacts.size > 0) {
      if (preview) {
        snapshotBaseline(preview);
      }
      return;
    }

    const committed = preview ?? baselineTransform;
    contacts.clear();
    baselineContacts.clear();
    baselineTransform = null;
    preview = null;
    ownerType = null;
    if (committed) {
      void options.commitTransform(committed);
    }
    options.previewTransform(null);
  };

  const handlePointerCancel = (event: PointerEvent) => {
    const existing = contacts.get(event.pointerId);
    if (!existing || existing.pointerType !== event.pointerType) {
      return;
    }
    event.preventDefault();
    clearGesture();
  };

  const handleLostPointerCapture = (event: PointerEvent) => {
    const existing = contacts.get(event.pointerId);
    if (!existing || existing.pointerType !== event.pointerType) {
      return;
    }
    clearGesture(event.pointerId);
  };

  surface.addEventListener("pointerdown", handlePointerDown, listenerOptions);
  surface.addEventListener("pointermove", handlePointerMove, listenerOptions);
  surface.addEventListener("pointerup", handlePointerUp, listenerOptions);
  surface.addEventListener(
    "pointercancel",
    handlePointerCancel,
    listenerOptions,
  );
  surface.addEventListener(
    "lostpointercapture",
    handleLostPointerCapture,
    listenerOptions,
  );

  return Object.freeze({
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      surface.removeEventListener("pointerdown", handlePointerDown);
      surface.removeEventListener("pointermove", handlePointerMove);
      surface.removeEventListener("pointerup", handlePointerUp);
      surface.removeEventListener("pointercancel", handlePointerCancel);
      surface.removeEventListener(
        "lostpointercapture",
        handleLostPointerCapture,
      );
      if (contacts.size > 0) {
        clearGesture();
      }
    },
  });
}

function contactTranslation(
  contacts: ReadonlyMap<number, DocumentContact>,
  baselineContacts: ReadonlyMap<number, DocumentContact>,
  baselineTransform: Matrix3,
): Matrix3 | null {
  const current = contacts.values().next().value;
  if (!current) {
    return null;
  }
  const baseline = baselineContacts.get(current.pointerId);
  if (!baseline) {
    return null;
  }
  return multiply(
    translation(
      current.point.x - baseline.point.x,
      current.point.y - baseline.point.y,
    ),
    baselineTransform,
  );
}

function pinchTransform(
  contacts: ReadonlyMap<number, DocumentContact>,
  baselineContacts: ReadonlyMap<number, DocumentContact>,
  baselineTransform: Matrix3,
): Matrix3 | null {
  const current = [...contacts.values()];
  const baseline = current.map((contact) =>
    baselineContacts.get(contact.pointerId),
  );
  if (
    current.length !== 2 ||
    !baseline[0] ||
    !baseline[1] ||
    current.some((contact) => contact.pointerType !== "touch")
  ) {
    return null;
  }

  const baselineDistance = distance(baseline[0].point, baseline[1].point);
  const currentDistance = distance(current[0].point, current[1].point);
  const rawScale =
    baselineDistance > 0 ? currentDistance / baselineDistance : 1;
  const absoluteBaselineScale = Math.hypot(
    baselineTransform[0],
    baselineTransform[3],
  );
  const absoluteScale = clamp(
    absoluteBaselineScale * rawScale,
    minimumFoundationScale,
    maximumFoundationScale,
  );
  const relativeScale =
    absoluteBaselineScale > 0 ? absoluteScale / absoluteBaselineScale : 1;
  const baselineCentroid = centroid(baseline[0].point, baseline[1].point);
  const currentCentroid = centroid(current[0].point, current[1].point);
  const gesture = multiply(
    translation(currentCentroid.x, currentCentroid.y),
    multiply(
      scale(relativeScale),
      translation(-baselineCentroid.x, -baselineCentroid.y),
    ),
  );
  return multiply(gesture, baselineTransform);
}

function toDocumentContact(
  event: PointerEvent,
  surface: SVGSVGElement,
  options: FoundationTransformControllerOptions,
): DocumentContact {
  const bounds = surface.getBoundingClientRect();
  const localPoint = {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
  return {
    pointerId: event.pointerId,
    pointerType: event.pointerType as DocumentContact["pointerType"],
    point: transformPoint(options.getInverseViewport(), localPoint),
  };
}

function centroid(first: Point2D, second: Point2D): Point2D {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function distance(first: Point2D, second: Point2D): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function capturePointer(surface: SVGSVGElement, pointerId: number): void {
  try {
    surface.setPointerCapture(pointerId);
  } catch {
    // Capture can fail when the pointer has already left the active surface.
  }
}

function releasePointer(surface: SVGSVGElement, pointerId: number): void {
  try {
    surface.releasePointerCapture(pointerId);
  } catch {
    // Pointer capture may already have been released by the browser.
  }
}
