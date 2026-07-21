import type { DesignDocument, PenSample } from "../../domain/document/types";
import { buildStrokeMesh } from "../../engine/brush/buildStrokeMesh";
import { normalizePointerEvent } from "../../engine/input/normalizePointerEvent";
import type { InputBatch, PointerEventLike } from "../../engine/input/types";
import { StrokeSession } from "../../engine/input/StrokeSession";
import type { Matrix3, Point2D } from "../../engine/math/affine";
import type { Renderer, RenderStroke } from "../../engine/render/Renderer";
import {
  ViewportController,
  type Bounds,
  type PointerContact,
  type SafeAreaInsets,
} from "../../engine/viewport/ViewportController";
import { studioPencil } from "../../state/editorStore";

export interface DrawingViewport {
  getMatrix(): Matrix3;
  getInverseMatrix(): Matrix3;
  subscribe(listener: (matrix: Matrix3) => void): () => void;
  onPointerDown(contact: PointerContact): void;
  onPointerMove(contact: PointerContact): void;
  onPointerUp(contact: PointerContact): void;
  onPointerCancel(contact: PointerContact): void;
  reset(
    documentBounds: Bounds,
    viewportBounds: Bounds,
    safeArea: SafeAreaInsets,
  ): void;
}

export type DrawingViewportFactory = (
  options: Readonly<{
    getActivePencilContact: () => Point2D | null;
    requestFrame: (callback: () => void) => number;
    cancelFrame: (frameId: number) => void;
  }>,
) => DrawingViewport;

export type DrawingController = Readonly<{
  dispose: () => void;
  requestRender: () => void;
}>;

export type CreateDrawingControllerOptions = Readonly<{
  surface: HTMLCanvasElement;
  renderer: Renderer;
  document: DesignDocument;
  commitStroke: (samples: readonly PenSample[]) => void | PromiseLike<void>;
  viewportFactory?: DrawingViewportFactory;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (frameId: number) => void;
  createResizeObserver?: (callback: ResizeObserverCallback) => ResizeObserver;
  getDevicePixelRatio?: () => number;
}>;

const listenerOptions: AddEventListenerOptions = Object.freeze({
  passive: false,
});
const noSafeArea: SafeAreaInsets = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

export function createDrawingController(
  options: CreateDrawingControllerOptions,
): DrawingController {
  const { surface, renderer, document } = options;
  const requestFrame = options.requestFrame ?? browserRequestFrame;
  const cancelFrame = options.cancelFrame ?? browserCancelFrame;
  const createResizeObserver =
    options.createResizeObserver ??
    ((callback: ResizeObserverCallback) => new ResizeObserver(callback));
  const getDevicePixelRatio =
    options.getDevicePixelRatio ?? (() => globalThis.devicePixelRatio || 1);
  let activePencilContact: Point2D | null = null;
  let renderFrame: number | null = null;
  let disposed = false;

  const viewport = (options.viewportFactory ?? defaultViewportFactory)({
    getActivePencilContact: () => activePencilContact,
    requestFrame: (callback) => requestFrame(() => callback()),
    cancelFrame,
  });

  const scheduleRender = () => {
    if (disposed || renderFrame !== null) {
      return;
    }
    renderFrame = requestFrame((timestamp) => {
      renderFrame = null;
      renderer.render(timestamp);
    });
  };

  const strokeSession = new StrokeSession({
    onPreview: (confirmed, predicted) => {
      if (confirmed.length === 0 && predicted.length === 0) {
        renderer.clearPreview();
      } else {
        renderer.previewStroke(
          previewStroke("preview-confirmed", confirmed),
          previewStroke("preview-predicted", predicted),
        );
      }
      scheduleRender();
    },
    onCommit: (samples) => {
      const result = options.commitStroke(samples);
      scheduleRender();
      return result;
    },
    onCancel: scheduleRender,
  });

  const handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      event.preventDefault();
      viewport.onPointerDown(toContact(event, surface));
      capturePointer(surface, event.pointerId);
      return;
    }
    if (event.pointerType !== "pen") {
      return;
    }
    event.preventDefault();
    activePencilContact = toLocalPoint(event, surface);
    capturePointer(surface, event.pointerId);
    strokeSession.handle(toInputBatch(event, "down", surface, viewport));
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      event.preventDefault();
      viewport.onPointerMove(toContact(event, surface));
      return;
    }
    if (event.pointerType !== "pen") {
      return;
    }
    event.preventDefault();
    activePencilContact = toLocalPoint(event, surface);
    strokeSession.handle(toInputBatch(event, "move", surface, viewport));
  };

  const handlePointerUp = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      event.preventDefault();
      viewport.onPointerUp(toContact(event, surface));
      releasePointer(surface, event.pointerId);
      return;
    }
    if (event.pointerType !== "pen") {
      return;
    }
    event.preventDefault();
    activePencilContact = toLocalPoint(event, surface);
    strokeSession.handle(toInputBatch(event, "up", surface, viewport));
    activePencilContact = null;
    releasePointer(surface, event.pointerId);
  };

  const handlePointerCancel = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      event.preventDefault();
      viewport.onPointerCancel(toContact(event, surface));
      releasePointer(surface, event.pointerId);
      return;
    }
    if (event.pointerType !== "pen") {
      return;
    }
    event.preventDefault();
    strokeSession.handle(toInputBatch(event, "cancel", surface, viewport));
    activePencilContact = null;
    releasePointer(surface, event.pointerId);
  };

  const handleLostPointerCapture = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      viewport.onPointerCancel(toContact(event, surface));
    } else if (event.pointerType === "pen") {
      strokeSession.lostPointerCapture(event.pointerId);
      activePencilContact = null;
    }
  };

  const moveEvent =
    typeof globalThis.PointerEvent === "function" &&
    (globalThis as typeof globalThis & { onpointerrawupdate?: unknown })
      .onpointerrawupdate !== undefined
      ? "pointerrawupdate"
      : "pointermove";
  const handleMoveEvent: EventListener = (event) => {
    handlePointerMove(event as PointerEvent);
  };
  surface.addEventListener("pointerdown", handlePointerDown, listenerOptions);
  surface.addEventListener(moveEvent, handleMoveEvent, listenerOptions);
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

  const unsubscribeViewport = viewport.subscribe((matrix) => {
    renderer.setViewport(matrix);
    scheduleRender();
  });
  renderer.setViewport(viewport.getMatrix());

  const resize = (width: number, height: number) => {
    renderer.resize(width, height, getDevicePixelRatio());
    viewport.reset(
      { x: 0, y: 0, width: document.width, height: document.height },
      { x: 0, y: 0, width, height },
      noSafeArea,
    );
    renderer.setViewport(viewport.getMatrix());
    scheduleRender();
  };
  const resizeObserver = createResizeObserver((entries) => {
    const entry = entries.find((candidate) => candidate.target === surface);
    if (entry) {
      resize(entry.contentRect.width, entry.contentRect.height);
    }
  });
  resizeObserver.observe(surface);
  const initialBounds = surface.getBoundingClientRect();
  resize(initialBounds.width, initialBounds.height);

  return Object.freeze({
    requestRender: scheduleRender,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      surface.removeEventListener("pointerdown", handlePointerDown);
      surface.removeEventListener(moveEvent, handleMoveEvent);
      surface.removeEventListener("pointerup", handlePointerUp);
      surface.removeEventListener("pointercancel", handlePointerCancel);
      surface.removeEventListener(
        "lostpointercapture",
        handleLostPointerCapture,
      );
      resizeObserver.disconnect();
      unsubscribeViewport();
      if (renderFrame !== null) {
        cancelFrame(renderFrame);
        renderFrame = null;
      }
    },
  });
}

function toInputBatch(
  event: PointerEvent,
  phase: InputBatch["phase"],
  surface: HTMLCanvasElement,
  viewport: DrawingViewport,
): InputBatch {
  const bounds = surface.getBoundingClientRect();
  return normalizePointerEvent(event as unknown as PointerEventLike, {
    phase,
    surfaceBounds: { left: bounds.left, top: bounds.top },
    inverseViewportMatrix: viewport.getInverseMatrix(),
  });
}

function toContact(
  event: PointerEvent,
  surface: HTMLCanvasElement,
): PointerContact {
  const localPoint = toLocalPoint(event, surface);
  return {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    clientX: localPoint.x,
    clientY: localPoint.y,
    width: event.width,
    height: event.height,
  };
}

function toLocalPoint(
  event: Pick<PointerEvent, "clientX" | "clientY">,
  surface: HTMLCanvasElement,
): Point2D {
  const bounds = surface.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

function previewStroke(
  operationId: string,
  samples: readonly PenSample[],
): RenderStroke | null {
  if (samples.length === 0) {
    return null;
  }
  return {
    operationId,
    mesh: buildStrokeMesh(samples, studioPencil),
    color: [38 / 255, 36 / 255, 33 / 255, 1],
  };
}

function capturePointer(surface: HTMLCanvasElement, pointerId: number): void {
  try {
    surface.setPointerCapture(pointerId);
  } catch {
    // Capture can fail when the pointer has already left the active surface.
  }
}

function releasePointer(surface: HTMLCanvasElement, pointerId: number): void {
  try {
    surface.releasePointerCapture(pointerId);
  } catch {
    // Pointer capture may already have been released by the browser.
  }
}

function defaultViewportFactory(
  options: Parameters<DrawingViewportFactory>[0],
): DrawingViewport {
  return new ViewportController({
    fingerAction: "navigate",
    getActivePencilContact: options.getActivePencilContact,
    requestFrame: options.requestFrame,
    cancelFrame: options.cancelFrame,
  });
}

function browserRequestFrame(callback: FrameRequestCallback): number {
  if (globalThis.requestAnimationFrame) {
    return globalThis.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(
    () => callback(globalThis.performance.now()),
    16,
  );
}

function browserCancelFrame(frameId: number): void {
  if (globalThis.cancelAnimationFrame) {
    globalThis.cancelAnimationFrame(frameId);
  } else {
    globalThis.clearTimeout(frameId);
  }
}
