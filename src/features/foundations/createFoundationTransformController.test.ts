import { afterEach, describe, expect, it, vi } from "vitest";
import { createFoundationState } from "../../domain/document/foundationState";
import type { FoundationState } from "../../domain/document/types";
import { identity, translation, type Matrix3 } from "../../engine/math/affine";
import { createFoundationTransformController } from "./createFoundationTransformController";

type PointerValues = Readonly<{
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
}>;

function pointerEvent(type: string, values: PointerValues): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { configurable: true, value: values.pointerId },
    pointerType: { configurable: true, value: values.pointerType },
    clientX: { configurable: true, value: values.x },
    clientY: { configurable: true, value: values.y },
  });
  return event;
}

function dispatch(
  surface: SVGSVGElement,
  type: string,
  values: PointerValues,
): void {
  surface.dispatchEvent(pointerEvent(type, values));
}

function pointerDown(surface: SVGSVGElement, values: PointerValues): void {
  dispatch(surface, "pointerdown", values);
}

function pointerMove(surface: SVGSVGElement, values: PointerValues): void {
  dispatch(surface, "pointermove", values);
}

function pointerUp(surface: SVGSVGElement, values: PointerValues): void {
  dispatch(surface, "pointerup", values);
}

function pointerCancel(surface: SVGSVGElement, values: PointerValues): void {
  dispatch(surface, "pointercancel", values);
}

function lostPointerCapture(
  surface: SVGSVGElement,
  values: PointerValues,
): void {
  dispatch(surface, "lostpointercapture", values);
}

const figure: FoundationState = {
  ...createFoundationState({
    assetId: "neutral-figure-front",
    assetVersion: 1,
    foundationType: "figure",
    visibleLandmarkGroups: ["outline", "center", "levels"],
  }),
  locked: false,
};

function setup(
  options: Readonly<{
    foundation?: FoundationState | null;
    inverseViewport?: Matrix3;
    bounds?: Readonly<{ left: number; top: number }>;
  }> = {},
) {
  const surface = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  surface.setPointerCapture = vi.fn();
  surface.releasePointerCapture = vi.fn();
  surface.getBoundingClientRect = vi.fn(() => ({
    x: options.bounds?.left ?? 0,
    y: options.bounds?.top ?? 0,
    left: options.bounds?.left ?? 0,
    top: options.bounds?.top ?? 0,
    right: (options.bounds?.left ?? 0) + 800,
    bottom: (options.bounds?.top ?? 0) + 600,
    width: 800,
    height: 600,
    toJSON: () => undefined,
  })) as unknown as typeof surface.getBoundingClientRect;
  const previewTransform = vi.fn<(transform: Matrix3 | null) => void>();
  const commitTransform =
    vi.fn<(transform: Matrix3) => void | PromiseLike<void>>();
  let foundation =
    options.foundation === undefined ? figure : options.foundation;
  const controller = createFoundationTransformController({
    surface,
    getFoundation: () => foundation,
    getInverseViewport: () => options.inverseViewport ?? identity(),
    previewTransform,
    commitTransform,
  });

  return {
    surface,
    previewTransform,
    commitTransform,
    controller,
    setFoundation(next: FoundationState | null) {
      foundation = next;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createFoundationTransformController", () => {
  it("previews translation and commits once on owner lift", () => {
    const { surface, previewTransform, commitTransform, controller } = setup();

    pointerDown(surface, {
      pointerId: 7,
      pointerType: "pen",
      x: 100,
      y: 200,
    });
    pointerMove(surface, {
      pointerId: 7,
      pointerType: "pen",
      x: 140,
      y: 260,
    });
    expect(previewTransform).toHaveBeenLastCalledWith(translation(40, 60));

    pointerUp(surface, {
      pointerId: 7,
      pointerType: "pen",
      x: 140,
      y: 260,
    });
    expect(commitTransform).toHaveBeenCalledTimes(1);
    expect(commitTransform).toHaveBeenCalledWith(translation(40, 60));
    expect(previewTransform).toHaveBeenLastCalledWith(null);
    expect(surface.setPointerCapture).toHaveBeenCalledWith(7);
    expect(surface.releasePointerCapture).toHaveBeenCalledWith(7);
    controller.dispose();
  });

  it("ignores a foreign Pencil and cancels without persistence", () => {
    const { surface, previewTransform, commitTransform, controller } = setup();

    pointerDown(surface, {
      pointerId: 7,
      pointerType: "pen",
      x: 100,
      y: 200,
    });
    pointerDown(surface, {
      pointerId: 8,
      pointerType: "pen",
      x: 300,
      y: 400,
    });
    pointerMove(surface, {
      pointerId: 8,
      pointerType: "pen",
      x: 350,
      y: 450,
    });
    pointerCancel(surface, {
      pointerId: 7,
      pointerType: "pen",
      x: 100,
      y: 200,
    });

    expect(commitTransform).not.toHaveBeenCalled();
    expect(previewTransform).toHaveBeenLastCalledWith(null);
    expect(surface.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(surface.releasePointerCapture).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("uses two touches for uniform scale and commits after the final lift", () => {
    const { surface, previewTransform, commitTransform, controller } = setup();

    pointerDown(surface, {
      pointerId: 10,
      pointerType: "touch",
      x: 100,
      y: 100,
    });
    pointerDown(surface, {
      pointerId: 11,
      pointerType: "touch",
      x: 200,
      y: 100,
    });
    pointerMove(surface, {
      pointerId: 11,
      pointerType: "touch",
      x: 250,
      y: 100,
    });

    expect(previewTransform).toHaveBeenLastCalledWith([
      1.5, 0, -50, 0, 1.5, -50, 0, 0, 1,
    ]);

    pointerUp(surface, {
      pointerId: 11,
      pointerType: "touch",
      x: 250,
      y: 100,
    });
    expect(commitTransform).not.toHaveBeenCalled();
    pointerUp(surface, {
      pointerId: 10,
      pointerType: "touch",
      x: 100,
      y: 100,
    });
    expect(commitTransform).toHaveBeenCalledTimes(1);
    expect(commitTransform).toHaveBeenCalledWith([
      1.5, 0, -50, 0, 1.5, -50, 0, 0, 1,
    ]);
    controller.dispose();
  });

  it("maps offset local coordinates through the inverse viewport", () => {
    const { surface, previewTransform, controller } = setup({
      inverseViewport: [2, 0, -20, 0, 2, -40, 0, 0, 1],
      bounds: { left: 50, top: 25 },
    });

    pointerDown(surface, {
      pointerId: 3,
      pointerType: "touch",
      x: 100,
      y: 75,
    });
    pointerMove(surface, {
      pointerId: 3,
      pointerType: "touch",
      x: 130,
      y: 95,
    });

    expect(previewTransform).toHaveBeenLastCalledWith(translation(60, 40));
    controller.dispose();
  });

  it("clamps the absolute scale without introducing rotation", () => {
    const { surface, previewTransform, controller } = setup({
      foundation: {
        ...figure,
        transform: [2, 0, 0, 0, 2, 0, 0, 0, 1],
      },
    });

    pointerDown(surface, {
      pointerId: 10,
      pointerType: "touch",
      x: 0,
      y: 0,
    });
    pointerDown(surface, {
      pointerId: 11,
      pointerType: "touch",
      x: 100,
      y: 0,
    });
    pointerMove(surface, {
      pointerId: 11,
      pointerType: "touch",
      x: 300,
      y: 0,
    });

    expect(previewTransform).toHaveBeenLastCalledWith([
      4, 0, 50, 0, 4, 0, 0, 0, 1,
    ]);
    controller.dispose();
  });

  it("keeps an off-axis pinch uniform without rotating the foundation", () => {
    const { surface, previewTransform, controller } = setup();

    pointerDown(surface, {
      pointerId: 10,
      pointerType: "touch",
      x: 0,
      y: 0,
    });
    pointerDown(surface, {
      pointerId: 11,
      pointerType: "touch",
      x: 100,
      y: 0,
    });
    pointerMove(surface, {
      pointerId: 11,
      pointerType: "touch",
      x: 100,
      y: 100,
    });

    const rootTwo = Math.sqrt(2);
    expect(previewTransform).toHaveBeenLastCalledWith([
      rootTwo,
      0,
      50 - 50 * rootTwo,
      0,
      rootTwo,
      50,
      0,
      0,
      1,
    ]);
    controller.dispose();
  });

  it("clamps a pinch-in to the minimum absolute scale", () => {
    const { surface, previewTransform, controller } = setup();

    pointerDown(surface, {
      pointerId: 10,
      pointerType: "touch",
      x: 0,
      y: 0,
    });
    pointerDown(surface, {
      pointerId: 11,
      pointerType: "touch",
      x: 100,
      y: 0,
    });
    pointerMove(surface, {
      pointerId: 11,
      pointerType: "touch",
      x: 10,
      y: 0,
    });

    expect(previewTransform).toHaveBeenLastCalledWith([
      0.25, 0, -7.5, 0, 0.25, 0, 0, 0, 1,
    ]);
    controller.dispose();
  });

  it("clears the whole gesture on lost capture and never commits it", () => {
    const { surface, previewTransform, commitTransform, controller } = setup();

    pointerDown(surface, {
      pointerId: 10,
      pointerType: "touch",
      x: 100,
      y: 100,
    });
    pointerDown(surface, {
      pointerId: 11,
      pointerType: "touch",
      x: 200,
      y: 100,
    });
    pointerMove(surface, {
      pointerId: 11,
      pointerType: "touch",
      x: 250,
      y: 100,
    });
    lostPointerCapture(surface, {
      pointerId: 10,
      pointerType: "touch",
      x: 100,
      y: 100,
    });
    pointerUp(surface, {
      pointerId: 11,
      pointerType: "touch",
      x: 250,
      y: 100,
    });

    expect(previewTransform).toHaveBeenLastCalledWith(null);
    expect(commitTransform).not.toHaveBeenCalled();
    expect(surface.releasePointerCapture).toHaveBeenCalledWith(11);
    controller.dispose();
  });

  it("does not capture contacts when there is no unlocked foundation", () => {
    const locked = setup({ foundation: { ...figure, locked: true } });
    const missing = setup({ foundation: null });

    pointerDown(locked.surface, {
      pointerId: 7,
      pointerType: "pen",
      x: 100,
      y: 200,
    });
    pointerDown(missing.surface, {
      pointerId: 10,
      pointerType: "touch",
      x: 100,
      y: 100,
    });

    expect(locked.surface.setPointerCapture).not.toHaveBeenCalled();
    expect(missing.surface.setPointerCapture).not.toHaveBeenCalled();
    expect(locked.previewTransform).not.toHaveBeenCalled();
    expect(missing.previewTransform).not.toHaveBeenCalled();
    locked.controller.dispose();
    missing.controller.dispose();
  });
});
