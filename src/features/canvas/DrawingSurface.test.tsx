import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDocument } from "../../domain/document/createDocument";
import type { DocumentOperation } from "../../domain/document/types";
import type { Renderer } from "../../engine/render/Renderer";
import type { RendererSelection } from "../../engine/render/createRenderer";
import { identity, type Matrix3 } from "../../engine/math/affine";
import type { ProjectRepository } from "../../platform/persistence/types";
import { createEditorStore, type EditorStore } from "../../state/editorStore";
import type { DrawingViewport } from "./createDrawingController";
import { DrawingSurface } from "./DrawingSurface";

type ObserverRecord = Readonly<{
  callback: ResizeObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}>;

let observer: ObserverRecord;

class ResizeObserverMock {
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    observer = { callback, observe: this.observe, disconnect: this.disconnect };
  }
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.stubGlobal("onpointerrawupdate", undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function projectRepository(): ProjectRepository & {
  appendOperation: ReturnType<
    typeof vi.fn<(operation: DocumentOperation) => Promise<void>>
  >;
} {
  return {
    listProjects: vi.fn(async () => []),
    createProject: vi.fn(async () => undefined),
    loadProject: vi.fn(async () =>
      createDocument({ projectId: "project-1", title: "Linen Wrap Study" }),
    ),
    appendOperation: vi.fn(async () => undefined),
    writeSnapshot: vi.fn(async () => undefined),
    deleteProject: vi.fn(async () => undefined),
  };
}

function mockRenderer(kind: Renderer["kind"] = "webgl2"): Renderer & {
  resize: ReturnType<typeof vi.fn<Renderer["resize"]>>;
  setViewport: ReturnType<typeof vi.fn<Renderer["setViewport"]>>;
  replaceDocument: ReturnType<typeof vi.fn<Renderer["replaceDocument"]>>;
  previewStroke: ReturnType<typeof vi.fn<Renderer["previewStroke"]>>;
  commitStroke: ReturnType<typeof vi.fn<Renderer["commitStroke"]>>;
  clearPreview: ReturnType<typeof vi.fn<Renderer["clearPreview"]>>;
  render: ReturnType<typeof vi.fn<Renderer["render"]>>;
  dispose: ReturnType<typeof vi.fn<Renderer["dispose"]>>;
} {
  return {
    kind,
    resize: vi.fn<Renderer["resize"]>(),
    setViewport: vi.fn<Renderer["setViewport"]>(),
    replaceDocument: vi.fn<Renderer["replaceDocument"]>(),
    previewStroke: vi.fn<Renderer["previewStroke"]>(),
    commitStroke: vi.fn<Renderer["commitStroke"]>(),
    clearPreview: vi.fn<Renderer["clearPreview"]>(),
    render: vi.fn<Renderer["render"]>(),
    dispose: vi.fn<Renderer["dispose"]>(),
  };
}

function mockViewport(): DrawingViewport & {
  onPointerDown: ReturnType<typeof vi.fn<DrawingViewport["onPointerDown"]>>;
  onPointerMove: ReturnType<typeof vi.fn<DrawingViewport["onPointerMove"]>>;
  onPointerUp: ReturnType<typeof vi.fn<DrawingViewport["onPointerUp"]>>;
  onPointerCancel: ReturnType<typeof vi.fn<DrawingViewport["onPointerCancel"]>>;
  reset: ReturnType<typeof vi.fn<DrawingViewport["reset"]>>;
} {
  let matrix: Matrix3 = identity();
  return {
    getMatrix: () => matrix,
    getInverseMatrix: () => identity(),
    subscribe: vi.fn((listener: (next: Matrix3) => void) => {
      listener(matrix);
      return () => undefined;
    }),
    onPointerDown: vi.fn<DrawingViewport["onPointerDown"]>(),
    onPointerMove: vi.fn<DrawingViewport["onPointerMove"]>(),
    onPointerUp: vi.fn<DrawingViewport["onPointerUp"]>(),
    onPointerCancel: vi.fn<DrawingViewport["onPointerCancel"]>(),
    reset: vi.fn<DrawingViewport["reset"]>(() => {
      matrix = identity();
    }),
  };
}

async function openStore(repository: ProjectRepository): Promise<EditorStore> {
  const ids = ["stroke-1", "visibility-1"];
  const store = createEditorStore({
    repository,
    createId: () => ids.shift() ?? "another-id",
    now: () => "2026-07-21T12:00:00.000Z",
  });
  await store.openProject("project-1");
  return store;
}

function selection(
  renderer: Renderer,
  surface: HTMLCanvasElement,
): RendererSelection {
  return {
    renderer,
    surface,
    fallbackReason:
      renderer.kind === "canvas2d-compat"
        ? {
            code: "webgl2-context-unavailable",
            message: "WebGL2 is unavailable.",
          }
        : null,
  };
}

function sample(
  clientX: number,
  clientY: number,
  timeStamp: number,
  pressure = 0.5,
) {
  return {
    pointerId: 7,
    pointerType: "pen",
    clientX,
    clientY,
    pressure,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    altitudeAngle: null,
    azimuthAngle: null,
    timeStamp,
  };
}

function pointerEvent(
  type: string,
  values: Record<string, unknown>,
  predicted: readonly Record<string, unknown>[] = [],
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [name, value] of Object.entries(values)) {
    Object.defineProperty(event, name, { configurable: true, value });
  }
  Object.defineProperty(event, "getCoalescedEvents", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(event, "getPredictedEvents", {
    configurable: true,
    value: () => predicted,
  });
  return event;
}

function renderSurface(
  store: EditorStore,
  renderer: Renderer,
  viewport: DrawingViewport,
  options: Readonly<{ rawUpdates?: boolean }> = {},
) {
  let activeSurface: HTMLCanvasElement | null = null;
  const rendererFactory = vi.fn((candidate: HTMLCanvasElement) => {
    const surface = candidate.cloneNode(false) as HTMLCanvasElement;
    if (options.rawUpdates) {
      Object.defineProperty(surface, "onpointerrawupdate", {
        configurable: true,
        value: null,
      });
    }
    surface.setPointerCapture = vi.fn();
    surface.releasePointerCapture = vi.fn();
    candidate.replaceWith(surface);
    activeSurface = surface;
    return selection(renderer, surface);
  });

  const result = render(
    <DrawingSurface
      document={store.getSnapshot().document!}
      rendererFactory={rendererFactory}
      store={store}
      viewportFactory={() => viewport}
    />,
  );

  return {
    ...result,
    rendererFactory,
    get surface(): HTMLCanvasElement {
      if (!activeSurface) {
        throw new Error("The drawing surface was not mounted.");
      }
      return activeSurface;
    },
  };
}

describe("DrawingSurface", () => {
  it("renders confirmed and predicted Pencil previews, then commits once on lift", async () => {
    const repository = projectRepository();
    const store = await openStore(repository);
    const renderer = mockRenderer();
    const viewport = mockViewport();
    const view = renderSurface(store, renderer, viewport);

    fireEvent(
      view.surface,
      pointerEvent("pointerdown", sample(10, 20, 100), [
        sample(11, 21, 101),
        sample(12, 22, 102),
      ]),
    );
    fireEvent(
      view.surface,
      pointerEvent("pointermove", sample(30, 40, 110), [
        sample(31, 41, 111),
        sample(35, 45, 112),
      ]),
    );

    expect(renderer.previewStroke).toHaveBeenLastCalledWith(
      expect.objectContaining({ operationId: "preview-confirmed" }),
      expect.objectContaining({ operationId: "preview-predicted" }),
    );

    fireEvent(view.surface, pointerEvent("pointerup", sample(40, 50, 120)));

    await waitFor(() =>
      expect(repository.appendOperation).toHaveBeenCalledTimes(1),
    );
    expect(renderer.clearPreview).toHaveBeenCalled();
    expect(renderer.commitStroke).toHaveBeenCalledTimes(1);
    expect(view.surface.setPointerCapture).toHaveBeenCalledWith(7);
    expect(view.surface.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(store.getSnapshot().document?.strokes).toHaveLength(1);
  });

  it("routes touch contacts only to the viewport controller", async () => {
    const repository = projectRepository();
    const store = await openStore(repository);
    const renderer = mockRenderer();
    const viewport = mockViewport();
    const view = renderSurface(store, renderer, viewport);
    const touch = {
      pointerId: 3,
      pointerType: "touch",
      clientX: 60,
      clientY: 70,
      width: 18,
      height: 20,
      timeStamp: 100,
    };

    fireEvent(view.surface, pointerEvent("pointerdown", touch));
    fireEvent(view.surface, pointerEvent("pointermove", touch));
    fireEvent(view.surface, pointerEvent("pointerup", touch));

    expect(viewport.onPointerDown).toHaveBeenCalledTimes(1);
    expect(viewport.onPointerMove).toHaveBeenCalledTimes(1);
    expect(viewport.onPointerUp).toHaveBeenCalledTimes(1);
    expect(renderer.previewStroke).not.toHaveBeenCalled();
    expect(repository.appendOperation).not.toHaveBeenCalled();
  });

  it("clears a canceled Pencil preview without persisting it", async () => {
    const repository = projectRepository();
    const store = await openStore(repository);
    const renderer = mockRenderer();
    const view = renderSurface(store, renderer, mockViewport());

    fireEvent(view.surface, pointerEvent("pointerdown", sample(10, 20, 100)));
    fireEvent(view.surface, pointerEvent("pointercancel", sample(20, 30, 110)));

    expect(renderer.clearPreview).toHaveBeenCalled();
    expect(renderer.commitStroke).not.toHaveBeenCalled();
    expect(repository.appendOperation).not.toHaveBeenCalled();
  });

  it("resizes the active renderer from ResizeObserver using device pixel ratio", async () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const store = await openStore(projectRepository());
    const renderer = mockRenderer();
    const view = renderSurface(store, renderer, mockViewport());

    act(() => {
      observer.callback(
        [
          {
            target: view.surface,
            contentRect: {
              width: 640,
              height: 480,
            } as DOMRectReadOnly,
          } as unknown as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      );
    });

    expect(renderer.resize).toHaveBeenLastCalledWith(640, 480, 2);
  });

  it("exposes the active canvas and an append-only Undo last stroke control", async () => {
    const user = userEvent.setup();
    const repository = projectRepository();
    const store = await openStore(repository);
    const renderer = mockRenderer();
    const view = renderSurface(store, renderer, mockViewport());

    expect(view.surface).toHaveAccessibleName(
      "Drawing canvas for Linen Wrap Study",
    );
    expect(view.surface).toHaveFocus();
    const undo = screen.getByRole("button", { name: "Undo last stroke" });
    expect(undo).toBeDisabled();

    fireEvent(view.surface, pointerEvent("pointerdown", sample(10, 20, 100)));
    fireEvent(view.surface, pointerEvent("pointerup", sample(30, 40, 110)));
    await waitFor(() => expect(undo).toBeEnabled());
    await user.click(undo);

    expect(repository.appendOperation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "stroke.visibility-set",
        targetOperationId: "stroke-1",
        visible: false,
      }),
    );
    expect(store.getSnapshot().document?.hiddenStrokeIds).toEqual(["stroke-1"]);
  });

  it("shows a notice only when the selected renderer is compatibility mode", async () => {
    const store = await openStore(projectRepository());
    renderSurface(store, mockRenderer("webgl2"), mockViewport());
    expect(
      screen.queryByText(/compatibility rendering/i),
    ).not.toBeInTheDocument();
    cleanup();

    renderSurface(store, mockRenderer("canvas2d-compat"), mockViewport());
    expect(screen.getByText(/compatibility rendering/i)).toBeVisible();
  });

  it("uses pointerrawupdate when supported and ignores pointermove fallback", async () => {
    vi.stubGlobal("PointerEvent", class PointerEventMock extends Event {});
    vi.stubGlobal("onpointerrawupdate", null);
    const store = await openStore(projectRepository());
    const renderer = mockRenderer();
    const view = renderSurface(store, renderer, mockViewport(), {
      rawUpdates: true,
    });
    fireEvent(view.surface, pointerEvent("pointerdown", sample(10, 20, 100)));
    renderer.previewStroke.mockClear();

    fireEvent(view.surface, pointerEvent("pointermove", sample(20, 30, 110)));
    expect(renderer.previewStroke).not.toHaveBeenCalled();

    fireEvent(
      view.surface,
      pointerEvent("pointerrawupdate", sample(30, 40, 120)),
    );
    expect(renderer.previewStroke).toHaveBeenCalledTimes(1);
  });
});
