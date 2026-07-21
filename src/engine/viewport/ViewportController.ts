import {
  identity,
  invert,
  multiply,
  rotation,
  scale,
  translation,
  type Matrix3,
  type Point2D,
} from "../math/affine";

export type PointerContact = Readonly<{
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  width: number;
  height: number;
}>;

export type FingerAction = "navigate" | "none";

export type Bounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type SafeAreaInsets = Readonly<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}>;

export type ViewportControllerOptions = Readonly<{
  fingerAction: FingerAction;
  getActivePencilContact: () => Point2D | null;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frameId: number) => void;
}>;

export type ViewportListener = (matrix: Matrix3) => void;

const PALM_MIN_CONTACT_SIZE = 40;
const PENCIL_PALM_SUPPRESSION_RADIUS = 80;
const MIN_SCALE = 0.05;
const MAX_SCALE = 32;
const SNAP_INTERVAL = Math.PI / 2;
const SNAP_ENGAGE_RADIANS = (3 * Math.PI) / 180;
const SNAP_RELEASE_RADIANS = (5 * Math.PI) / 180;
const ANGLE_EPSILON = 1e-12;

export class ViewportController {
  private matrix: Matrix3 = identity();
  private readonly contacts = new Map<number, PointerContact>();
  private baselineMatrix: Matrix3 = identity();
  private baselineContacts = new Map<number, PointerContact>();
  private snappedRotation: number | null = null;
  private readonly listeners = new Set<ViewportListener>();
  private pendingFrame: number | null = null;

  public constructor(private readonly options: ViewportControllerOptions) {}

  public getMatrix(): Matrix3 {
    return this.matrix;
  }

  public getInverseMatrix(): Matrix3 {
    return invert(this.matrix);
  }

  public subscribe(listener: ViewportListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.pendingFrame !== null) {
        this.options.cancelFrame(this.pendingFrame);
        this.pendingFrame = null;
      }
    };
  }

  public onPointerDown(contact: PointerContact): void {
    if (
      contact.pointerType !== "touch" ||
      this.contacts.has(contact.pointerId) ||
      this.isPalmNearPencil(contact)
    ) {
      return;
    }

    this.contacts.set(contact.pointerId, contact);
    this.rebase();
  }

  public onPointerMove(contact: PointerContact): void {
    if (
      contact.pointerType !== "touch" ||
      !this.contacts.has(contact.pointerId)
    ) {
      return;
    }

    this.contacts.set(contact.pointerId, contact);
    if (this.contacts.size === 1 && this.options.fingerAction !== "navigate") {
      return;
    }

    this.applyGesture();
  }

  public onPointerUp(contact: PointerContact): void {
    if (
      contact.pointerType !== "touch" ||
      !this.contacts.has(contact.pointerId)
    ) {
      return;
    }

    this.contacts.set(contact.pointerId, contact);
    if (this.contacts.size > 1 || this.options.fingerAction === "navigate") {
      this.applyGesture();
    }
    this.contacts.delete(contact.pointerId);
    this.rebase();
  }

  public onPointerCancel(contact: PointerContact): void {
    if (
      contact.pointerType !== "touch" ||
      !this.contacts.delete(contact.pointerId)
    ) {
      return;
    }

    this.rebase();
  }

  /**
   * Fits and centers the document in the safe-area-adjusted viewport whenever
   * the literal fit scale is within 0.05–32. Outside that range, it uses the
   * nearest supported zoom and centers the document as a best effort.
   */
  public reset(
    documentBounds: Bounds,
    viewportBounds: Bounds,
    safeArea: SafeAreaInsets,
  ): void {
    const availableWidth =
      viewportBounds.width - safeArea.left - safeArea.right;
    const availableHeight =
      viewportBounds.height - safeArea.top - safeArea.bottom;
    const fittedScale = Math.min(
      MAX_SCALE,
      Math.max(
        MIN_SCALE,
        Math.min(
          availableWidth / documentBounds.width,
          availableHeight / documentBounds.height,
        ),
      ),
    );
    const availableCenter = {
      x: viewportBounds.x + safeArea.left + availableWidth / 2,
      y: viewportBounds.y + safeArea.top + availableHeight / 2,
    };
    const documentCenter = {
      x: documentBounds.x + documentBounds.width / 2,
      y: documentBounds.y + documentBounds.height / 2,
    };

    this.updateMatrix(
      multiply(
        translation(availableCenter.x, availableCenter.y),
        multiply(
          scale(fittedScale),
          translation(-documentCenter.x, -documentCenter.y),
        ),
      ),
    );
    this.rebase();
  }

  private rebase(): void {
    this.baselineMatrix = this.matrix;
    this.baselineContacts = new Map(this.contacts);
    if (this.contacts.size === 2) {
      const currentRotation = matrixRotation(this.matrix);
      const nearestSnap = nearestCardinalRotation(currentRotation);
      this.snappedRotation =
        angularDistance(currentRotation, nearestSnap) <=
        SNAP_ENGAGE_RADIANS + ANGLE_EPSILON
          ? nearestSnap
          : null;
    } else {
      this.snappedRotation = null;
    }
  }

  private isPalmNearPencil(contact: PointerContact): boolean {
    if (Math.max(contact.width, contact.height) < PALM_MIN_CONTACT_SIZE) {
      return false;
    }

    const pencil = this.options.getActivePencilContact();
    return (
      pencil !== null &&
      Math.hypot(contact.clientX - pencil.x, contact.clientY - pencil.y) <=
        PENCIL_PALM_SUPPRESSION_RADIUS
    );
  }

  private applyGesture(): void {
    const current = [...this.contacts.values()];
    const baseline = current.map((contact) =>
      this.baselineContacts.get(contact.pointerId),
    );

    if (current.length === 0 || baseline[0] === undefined) {
      return;
    }

    if (current.length === 1 || baseline[1] === undefined) {
      this.updateMatrix(
        multiply(
          translation(
            current[0].clientX - baseline[0].clientX,
            current[0].clientY - baseline[0].clientY,
          ),
          this.baselineMatrix,
        ),
      );
      return;
    }

    const baselineCentroid = centroid(baseline[0], baseline[1]);
    const currentCentroid = centroid(current[0], current[1]);
    const baselineDistance = distance(baseline[0], baseline[1]);
    const currentDistance = distance(current[0], current[1]);
    const requestedScaleFactor =
      baselineDistance === 0 ? 1 : currentDistance / baselineDistance;
    const baselineScale = Math.hypot(
      this.baselineMatrix[0],
      this.baselineMatrix[3],
    );
    const scaleFactor =
      Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, baselineScale * requestedScaleFactor),
      ) / baselineScale;
    const rawAngleDelta =
      angle(current[0], current[1]) - angle(baseline[0], baseline[1]);
    const baselineRotation = matrixRotation(this.baselineMatrix);
    const appliedRotation = this.snapRotation(baselineRotation + rawAngleDelta);
    const angleDelta = normalizeAngle(appliedRotation - baselineRotation);

    this.updateMatrix(
      multiply(
        translation(currentCentroid.x, currentCentroid.y),
        multiply(
          rotation(angleDelta),
          multiply(
            scale(scaleFactor),
            multiply(
              translation(-baselineCentroid.x, -baselineCentroid.y),
              this.baselineMatrix,
            ),
          ),
        ),
      ),
    );
  }

  private snapRotation(rawRotation: number): number {
    if (
      this.snappedRotation !== null &&
      angularDistance(rawRotation, this.snappedRotation) <=
        SNAP_RELEASE_RADIANS + ANGLE_EPSILON
    ) {
      return this.snappedRotation;
    }

    this.snappedRotation = null;
    const nearestSnap = nearestCardinalRotation(rawRotation);
    if (
      angularDistance(rawRotation, nearestSnap) <=
      SNAP_ENGAGE_RADIANS + ANGLE_EPSILON
    ) {
      this.snappedRotation = nearestSnap;
      return nearestSnap;
    }

    return rawRotation;
  }

  private updateMatrix(matrix: Matrix3): void {
    if (matricesEqual(this.matrix, matrix)) {
      return;
    }

    this.matrix = matrix;
    if (this.listeners.size === 0 || this.pendingFrame !== null) {
      return;
    }

    this.pendingFrame = this.options.requestFrame(() => {
      this.pendingFrame = null;
      for (const listener of this.listeners) {
        listener(this.matrix);
      }
    });
  }
}

function centroid(first: PointerContact, second: PointerContact): Point2D {
  return {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2,
  };
}

function distance(first: PointerContact, second: PointerContact): number {
  return Math.hypot(
    second.clientX - first.clientX,
    second.clientY - first.clientY,
  );
}

function angle(first: PointerContact, second: PointerContact): number {
  return Math.atan2(
    second.clientY - first.clientY,
    second.clientX - first.clientX,
  );
}

function matrixRotation(matrix: Matrix3): number {
  return Math.atan2(matrix[3], matrix[0]);
}

function nearestCardinalRotation(radians: number): number {
  return Math.round(radians / SNAP_INTERVAL) * SNAP_INTERVAL;
}

function normalizeAngle(radians: number): number {
  return Math.atan2(Math.sin(radians), Math.cos(radians));
}

function angularDistance(first: number, second: number): number {
  return Math.abs(normalizeAngle(first - second));
}

function matricesEqual(first: Matrix3, second: Matrix3): boolean {
  return first.every((value, index) => value === second[index]);
}
