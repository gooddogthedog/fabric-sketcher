import { describe, expect, it } from "vitest";
import { transformPoint } from "../math/affine";
import {
  ViewportController,
  type PointerContact,
  type ViewportControllerOptions,
} from "./ViewportController";

function touch(
  pointerId: number,
  clientX: number,
  clientY: number,
  size = 10,
): PointerContact {
  return {
    pointerId,
    pointerType: "touch",
    clientX,
    clientY,
    width: size,
    height: size,
  };
}

function createController(
  overrides: Partial<ViewportControllerOptions> = {},
): ViewportController {
  return new ViewportController({
    fingerAction: "navigate",
    getActivePencilContact: () => null,
    requestFrame: () => 1,
    cancelFrame: () => undefined,
    ...overrides,
  });
}

function startRotationGesture(controller: ViewportController): void {
  controller.onPointerDown(touch(1, -50, 0));
  controller.onPointerDown(touch(2, 50, 0));
}

function moveRotationGesture(
  controller: ViewportController,
  degrees: number,
): void {
  const radians = (degrees * Math.PI) / 180;
  const x = 50 * Math.cos(radians);
  const y = 50 * Math.sin(radians);
  controller.onPointerMove(touch(1, -x, -y));
  controller.onPointerMove(touch(2, x, y));
}

function matrixRotationDegrees(controller: ViewportController): number {
  const matrix = controller.getMatrix();
  const degrees = (Math.atan2(matrix[3], matrix[0]) * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

describe("ViewportController", () => {
  it("pans with one touch when the finger action is navigate", () => {
    const controller = createController();

    controller.onPointerDown(touch(1, 20, 30));
    controller.onPointerMove(touch(1, 55, 18));

    expect(transformPoint(controller.getMatrix(), { x: 0, y: 0 })).toEqual({
      x: 35,
      y: -12,
    });
  });

  it("pans, zooms, and rotates two touches around their gesture centroid", () => {
    const controller = createController();

    controller.onPointerDown(touch(1, 0, 0));
    controller.onPointerDown(touch(2, 10, 0));
    controller.onPointerMove(touch(1, 15, 10));
    controller.onPointerMove(touch(2, 15, 30));

    const transformedCentroid = transformPoint(controller.getMatrix(), {
      x: 5,
      y: 0,
    });
    const transformedSecondPoint = transformPoint(controller.getMatrix(), {
      x: 10,
      y: 0,
    });
    expect(transformedCentroid.x).toBeCloseTo(15, 10);
    expect(transformedCentroid.y).toBeCloseTo(20, 10);
    expect(transformedSecondPoint.x).toBeCloseTo(15, 10);
    expect(transformedSecondPoint.y).toBeCloseTo(30, 10);
  });

  it("ignores pen contacts", () => {
    const controller = createController();
    const pen = (clientX: number, clientY: number): PointerContact => ({
      ...touch(7, clientX, clientY),
      pointerType: "pen",
    });

    controller.onPointerDown(pen(10, 10));
    controller.onPointerMove(pen(80, 90));

    expect(controller.getMatrix()).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("suppresses a palm-sized touch starting within 80 CSS px of active Pencil", () => {
    const controller = createController({
      getActivePencilContact: () => ({ x: 100, y: 100 }),
    });

    controller.onPointerDown(touch(1, 148, 136, 60));
    controller.onPointerMove(touch(1, 220, 220, 60));

    expect(controller.getMatrix()).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("treats an elongated contact as palm-sized near active Pencil", () => {
    const controller = createController({
      getActivePencilContact: () => ({ x: 100, y: 100 }),
    });
    const elongatedPalm = (clientX: number): PointerContact => ({
      ...touch(1, clientX, 100),
      width: 60,
      height: 30,
    });

    controller.onPointerDown(elongatedPalm(180));
    controller.onPointerMove(elongatedPalm(220));

    expect(controller.getMatrix()).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("allows a palm-sized contact starting beyond the 80 CSS px boundary", () => {
    const controller = createController({
      getActivePencilContact: () => ({ x: 100, y: 100 }),
    });
    const outsidePalm = (clientX: number): PointerContact => ({
      ...touch(1, clientX, 100),
      width: 60,
      height: 30,
    });

    controller.onPointerDown(outsidePalm(180.001));
    controller.onPointerMove(outsidePalm(190.001));

    expect(transformPoint(controller.getMatrix(), { x: 0, y: 0 })).toEqual({
      x: 10,
      y: 0,
    });
  });

  it("rebases without a jump when a finger joins or leaves navigation", () => {
    const controller = createController();

    controller.onPointerDown(touch(1, 0, 0));
    controller.onPointerMove(touch(1, 10, 0));
    const beforeJoin = controller.getMatrix();

    controller.onPointerDown(touch(2, 30, 0));
    expect(controller.getMatrix()).toEqual(beforeJoin);

    controller.onPointerMove(touch(2, 40, 0));
    const beforeLeave = controller.getMatrix();
    const originBeforeLeave = transformPoint(beforeLeave, { x: 0, y: 0 });

    controller.onPointerUp(touch(2, 40, 0));
    expect(controller.getMatrix()).toEqual(beforeLeave);

    controller.onPointerMove(touch(1, 20, 0));
    const originAfterRemainingFingerMoves = transformPoint(
      controller.getMatrix(),
      { x: 0, y: 0 },
    );
    expect(originAfterRemainingFingerMoves.x).toBeCloseTo(
      originBeforeLeave.x + 10,
      10,
    );
    expect(originAfterRemainingFingerMoves.y).toBeCloseTo(
      originBeforeLeave.y,
      10,
    );
  });

  it("clamps gesture scale to 0.05–32 and keeps the transform invertible", () => {
    const zoomedIn = createController();
    zoomedIn.onPointerDown(touch(1, 0, 0));
    zoomedIn.onPointerDown(touch(2, 10, 0));
    zoomedIn.onPointerMove(touch(2, 1_000, 0));

    expect(Math.hypot(zoomedIn.getMatrix()[0], zoomedIn.getMatrix()[3])).toBe(
      32,
    );

    const zoomedOut = createController();
    zoomedOut.onPointerDown(touch(1, 0, 0));
    zoomedOut.onPointerDown(touch(2, 100, 0));
    zoomedOut.onPointerMove(touch(2, 1, 0));

    expect(
      Math.hypot(zoomedOut.getMatrix()[0], zoomedOut.getMatrix()[3]),
    ).toBeCloseTo(0.05, 12);
    expect(zoomedOut.getInverseMatrix().every(Number.isFinite)).toBe(true);
  });

  it("snaps to cardinal rotations with 3° engage and 5° release hysteresis", () => {
    for (const target of [0, 90, 180, 270]) {
      const controller = createController();
      startRotationGesture(controller);
      moveRotationGesture(controller, target + 3);
      expect(matrixRotationDegrees(controller)).toBeCloseTo(target, 10);
    }

    const controller = createController();
    startRotationGesture(controller);
    moveRotationGesture(controller, 3);
    expect(matrixRotationDegrees(controller)).toBeCloseTo(0, 10);

    moveRotationGesture(controller, 5);
    expect(matrixRotationDegrees(controller)).toBeCloseTo(0, 10);

    moveRotationGesture(controller, 5.01);
    expect(matrixRotationDegrees(controller)).toBeCloseTo(5.01, 8);

    moveRotationGesture(controller, 3.01);
    expect(matrixRotationDegrees(controller)).toBeCloseTo(3.01, 8);

    moveRotationGesture(controller, 3);
    expect(matrixRotationDegrees(controller)).toBeCloseTo(0, 10);
  });

  it("fits the document within safe-area-adjusted bounds on reset", () => {
    const controller = createController();

    controller.reset(
      { x: 0, y: 0, width: 1_000, height: 500 },
      { x: 0, y: 0, width: 800, height: 600 },
      { top: 20, right: 40, bottom: 30, left: 60 },
    );

    const topLeft = transformPoint(controller.getMatrix(), { x: 0, y: 0 });
    const bottomRight = transformPoint(controller.getMatrix(), {
      x: 1_000,
      y: 500,
    });
    expect(topLeft.x).toBeCloseTo(60, 10);
    expect(topLeft.y).toBeCloseTo(120, 10);
    expect(bottomRight.x).toBeCloseTo(760, 10);
    expect(bottomRight.y).toBeCloseTo(470, 10);
  });

  it("batches subscriber updates into one injected animation frame", () => {
    let nextFrameId = 0;
    const frames = new Map<number, () => void>();
    const controller = createController({
      requestFrame: (callback) => {
        const frameId = ++nextFrameId;
        frames.set(frameId, callback);
        return frameId;
      },
      cancelFrame: (frameId) => {
        frames.delete(frameId);
      },
    });
    const notifiedMatrices: number[] = [];
    const unsubscribe = controller.subscribe((matrix) => {
      notifiedMatrices.push(matrix[2]);
    });

    controller.onPointerDown(touch(1, 0, 0));
    controller.onPointerMove(touch(1, 10, 0));
    controller.onPointerMove(touch(1, 25, 0));

    expect(frames.size).toBe(1);
    expect(notifiedMatrices).toEqual([]);
    const pendingFrame = [...frames.entries()][0];
    frames.delete(pendingFrame[0]);
    pendingFrame[1]();
    expect(notifiedMatrices).toEqual([25]);

    controller.onPointerMove(touch(1, 30, 0));
    expect(frames.size).toBe(1);
    unsubscribe();
    expect(frames.size).toBe(0);
  });

  it("rebases remaining navigation contacts when a touch is cancelled", () => {
    const controller = createController();
    controller.onPointerDown(touch(1, 0, 0));
    controller.onPointerDown(touch(2, 20, 0));
    controller.onPointerMove(touch(2, 30, 0));
    const beforeCancel = controller.getMatrix();
    const transformedOrigin = transformPoint(beforeCancel, { x: 0, y: 0 });

    controller.onPointerCancel(touch(2, 300, 300));
    expect(controller.getMatrix()).toEqual(beforeCancel);

    controller.onPointerMove(touch(1, 10, 0));
    const movedOrigin = transformPoint(controller.getMatrix(), { x: 0, y: 0 });
    expect(movedOrigin.x).toBeCloseTo(transformedOrigin.x + 10, 10);
    expect(movedOrigin.y).toBeCloseTo(transformedOrigin.y, 10);
  });

  it("tracks each touch pointer ID only once", () => {
    const controller = createController();
    controller.onPointerDown(touch(1, 0, 0));
    controller.onPointerMove(touch(1, 10, 0));

    controller.onPointerDown(touch(1, 100, 100));
    controller.onPointerMove(touch(1, 20, 0));

    expect(transformPoint(controller.getMatrix(), { x: 0, y: 0 })).toEqual({
      x: 20,
      y: 0,
    });
  });
});
