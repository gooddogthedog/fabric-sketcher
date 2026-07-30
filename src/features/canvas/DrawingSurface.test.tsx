// @ts-expect-error -- Vitest executes under Node; the app build intentionally
// omits Node types.
import { readFileSync } from "node:fs";
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
import { documentReducer } from "../../domain/document/documentReducer";
import { createFoundationState } from "../../domain/document/foundationState";
import type {
  BrushSnapshot,
  DocumentOperation,
  EraserSnapshot,
} from "../../domain/document/types";
import { createEraserSnapshot } from "../../engine/brush/eraser";
import { getBrushPreset } from "../../engine/brush/presets";
import type { Renderer } from "../../engine/render/Renderer";
import type { RendererSelection } from "../../engine/render/createRenderer";
import {
  identity,
  invert,
  transformPoint,
  type Matrix3,
} from "../../engine/math/affine";
import type { ProjectRepository } from "../../platform/persistence/types";
import {
  createEditorStore,
  type EditorStore,
  type EditorTool,
} from "../../state/editorStore";
import {
  createDrawingController,
  type DrawingViewport,
  type DrawingViewportFactory,
} from "./createDrawingController";
import { DrawingSurface } from "./DrawingSurface";

const PROJECT_DIRECTORY = (
  globalThis as typeof globalThis & {
    process: { cwd(): string };
  }
).process.cwd();
const APP_STYLES = readFileSync(`${PROJECT_DIRECTORY}/src/app/app.css`, "utf8");

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
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => {
      return {
        ok: true,
        url: "",
        text: async () => `<svg xmlns="http://www.w3.org/2000/svg">
          <symbol id="foundation-outline" />
          <symbol id="foundation-center" />
          <symbol id="foundation-levels" />
          <symbol id="foundation-construction" />
        </svg>`,
      } as Response;
    }),
  );
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
  pointerType: "mouse" | "pen" = "pen",
) {
  return {
    pointerId: 7,
    pointerType,
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
  options: Readonly<{
    rawUpdates?: boolean;
    bounds?: Readonly<{
      left: number;
      top: number;
      width: number;
      height: number;
    }>;
    onViewportOptions?: (
      options: Parameters<DrawingViewportFactory>[0],
    ) => void;
  }> = {},
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
    if (options.bounds) {
      surface.getBoundingClientRect = vi.fn(() => ({
        ...options.bounds,
        x: options.bounds?.left ?? 0,
        y: options.bounds?.top ?? 0,
        right: (options.bounds?.left ?? 0) + (options.bounds?.width ?? 0),
        bottom: (options.bounds?.top ?? 0) + (options.bounds?.height ?? 0),
        toJSON: () => undefined,
      })) as unknown as typeof surface.getBoundingClientRect;
    }
    candidate.replaceWith(surface);
    activeSurface = surface;
    return selection(renderer, surface);
  });

  const result = render(
    <DrawingSurface
      document={store.getSnapshot().document!}
      rendererFactory={rendererFactory}
      store={store}
      viewportFactory={(viewportOptions) => {
        options.onViewportOptions?.(viewportOptions);
        return viewport;
      }}
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

describe("createDrawingController eraser", () => {
  it("commits an erase with the tool captured at Pencil-down", () => {
    const surface = document.createElement("canvas");
    surface.setPointerCapture = vi.fn();
    surface.releasePointerCapture = vi.fn();
    const renderer = mockRenderer();
    const painted: BrushSnapshot[] = [];
    const erased: EraserSnapshot[] = [];
    const denim = getBrushPreset("denim-v1");
    let tool: EditorTool = "eraser";

    createDrawingController({
      surface,
      renderer,
      document: createDocument({
        projectId: "project-1",
        title: "Eraser test",
      }),
      commitStroke: (_samples, brush) => {
        painted.push(brush);
      },
      commitErase: (_samples, eraser) => {
        erased.push(eraser);
      },
      getBrush: () => denim,
      getTool: () => tool,
      getEraser: () => createEraserSnapshot(denim),
      viewportFactory: () => mockViewport(),
    });

    surface.dispatchEvent(pointerEvent("pointerdown", sample(10, 20, 100)));
    // Switching mid-contact must not change what this contact commits.
    tool = "brush";
    surface.dispatchEvent(pointerEvent("pointermove", sample(30, 40, 110)));

    const preview = vi.mocked(renderer.previewStroke).mock.lastCall?.[0];
    expect(preview?.composite).toBe("erase");
    expect(preview?.texture.strength).toBe(0);

    surface.dispatchEvent(pointerEvent("pointerup", sample(40, 50, 120)));

    expect(painted).toEqual([]);
    expect(erased).toEqual([createEraserSnapshot(denim)]);
  });

  it("keeps painting while the brush tool is active", () => {
    const surface = document.createElement("canvas");
    surface.setPointerCapture = vi.fn();
    surface.releasePointerCapture = vi.fn();
    const renderer = mockRenderer();
    const painted: BrushSnapshot[] = [];
    const erased: EraserSnapshot[] = [];
    const pencil = getBrushPreset("studio-pencil-v1");

    createDrawingController({
      surface,
      renderer,
      document: createDocument({
        projectId: "project-1",
        title: "Brush test",
      }),
      commitStroke: (_samples, brush) => {
        painted.push(brush);
      },
      commitErase: (_samples, eraser) => {
        erased.push(eraser);
      },
      getBrush: () => pencil,
      getTool: () => "brush",
      getEraser: () => createEraserSnapshot(pencil),
      viewportFactory: () => mockViewport(),
    });

    surface.dispatchEvent(pointerEvent("pointerdown", sample(10, 20, 100)));
    surface.dispatchEvent(pointerEvent("pointermove", sample(30, 40, 110)));
    const preview = vi.mocked(renderer.previewStroke).mock.lastCall?.[0];
    surface.dispatchEvent(pointerEvent("pointerup", sample(40, 50, 120)));

    expect(preview?.composite).toBe("paint");
    expect(erased).toEqual([]);
    expect(painted).toEqual([pencil]);
  });
});

describe("DrawingSurface", () => {
  it("uses the brush selected after controller creation for preview and commit", () => {
    const surface = document.createElement("canvas");
    surface.setPointerCapture = vi.fn();
    surface.releasePointerCapture = vi.fn();
    const renderer = mockRenderer();
    const committed: BrushSnapshot[] = [];
    let selectedBrush = getBrushPreset("studio-pencil-v1");

    const controller = createDrawingController({
      surface,
      renderer,
      document: createDocument({ projectId: "project-1", title: "Brush test" }),
      commitStroke: (_samples, brush) => {
        committed.push(brush);
      },
      commitErase: () => undefined,
      getBrush: () => selectedBrush,
      getTool: () => "brush",
      getEraser: () => createEraserSnapshot(selectedBrush),
      viewportFactory: () => mockViewport(),
    });
    selectedBrush = getBrushPreset("denim-v1");

    surface.dispatchEvent(pointerEvent("pointerdown", sample(10, 20, 100)));
    surface.dispatchEvent(pointerEvent("pointermove", sample(30, 40, 110)));

    const preview = vi.mocked(renderer.previewStroke).mock.lastCall?.[0];
    expect(preview?.color).toEqual([41 / 255, 79 / 255, 104 / 255, 1]);
    expect(preview?.texture.kind).toBe("denim");
    expect(preview?.mesh).toHaveLength(12);
    expect(preview?.mesh[2]).toBeCloseTo(0.6364, 4);

    surface.dispatchEvent(pointerEvent("pointerup", sample(40, 50, 120)));
    expect(committed).toHaveLength(1);
    expect(committed[0]?.id).toBe("denim-v1");
    controller.dispose();
  });

  it("keeps each Pencil contact on its immutable down brush when selection changes", () => {
    const surface = document.createElement("canvas");
    surface.setPointerCapture = vi.fn();
    surface.releasePointerCapture = vi.fn();
    const renderer = mockRenderer();
    const committed: BrushSnapshot[] = [];
    const denim = {
      ...getBrushPreset("denim-v1"),
      texture: { ...getBrushPreset("denim-v1").texture },
    } as BrushSnapshot;
    let selectedBrush: BrushSnapshot = denim;

    const controller = createDrawingController({
      surface,
      renderer,
      document: createDocument({ projectId: "project-1", title: "Brush test" }),
      commitStroke: (_samples, brush) => {
        committed.push(brush);
      },
      commitErase: () => undefined,
      getBrush: () => selectedBrush,
      getTool: () => "brush",
      getEraser: () => createEraserSnapshot(selectedBrush),
      viewportFactory: () => mockViewport(),
    });

    surface.dispatchEvent(pointerEvent("pointerdown", sample(10, 20, 100)));
    selectedBrush = getBrushPreset("silk-v1");
    (denim as { color: BrushSnapshot["color"] }).color = "#000000";
    (denim.texture as { strength: number }).strength = 0;
    surface.dispatchEvent(pointerEvent("pointermove", sample(30, 40, 110)));

    const firstPreview = vi.mocked(renderer.previewStroke).mock.lastCall?.[0];
    expect(firstPreview?.color).toEqual([41 / 255, 79 / 255, 104 / 255, 1]);
    expect(firstPreview?.texture).toMatchObject({
      kind: "denim",
      strength: 0.62,
    });
    surface.dispatchEvent(pointerEvent("pointerup", sample(40, 50, 120)));
    expect(committed[0]?.id).toBe("denim-v1");
    expect(committed[0]?.color).toBe("#294F68");
    expect(Object.isFrozen(committed[0])).toBe(true);
    expect(Object.isFrozen(committed[0]?.texture)).toBe(true);

    surface.dispatchEvent(pointerEvent("pointerdown", sample(50, 60, 130)));
    surface.dispatchEvent(pointerEvent("pointermove", sample(70, 80, 140)));
    const secondPreview = vi.mocked(renderer.previewStroke).mock.lastCall?.[0];
    expect(secondPreview?.color).toEqual([143 / 255, 62 / 255, 75 / 255, 1]);
    expect(secondPreview?.texture.kind).toBe("silk");
    surface.dispatchEvent(pointerEvent("pointerup", sample(80, 90, 150)));
    expect(committed[1]?.id).toBe("silk-v1");
    controller.dispose();
  });

  it("keeps the owned Pencil brush through foreign pen contacts", () => {
    const surface = document.createElement("canvas");
    surface.setPointerCapture = vi.fn();
    surface.releasePointerCapture = vi.fn();
    const renderer = mockRenderer();
    const committed: BrushSnapshot[] = [];
    let selectedBrush = getBrushPreset("denim-v1");

    const controller = createDrawingController({
      surface,
      renderer,
      document: createDocument({ projectId: "project-1", title: "Brush test" }),
      commitStroke: (_samples, brush) => {
        committed.push(brush);
      },
      commitErase: () => undefined,
      getBrush: () => selectedBrush,
      getTool: () => "brush",
      getEraser: () => createEraserSnapshot(selectedBrush),
      viewportFactory: () => mockViewport(),
    });

    surface.dispatchEvent(pointerEvent("pointerdown", sample(10, 20, 100)));
    renderer.previewStroke.mockClear();
    selectedBrush = getBrushPreset("silk-v1");
    const foreign = { ...sample(50, 60, 105), pointerId: 8 };
    surface.dispatchEvent(pointerEvent("pointerdown", foreign));
    surface.dispatchEvent(pointerEvent("pointerup", foreign));
    surface.dispatchEvent(pointerEvent("pointercancel", foreign));
    surface.dispatchEvent(pointerEvent("lostpointercapture", foreign));

    surface.dispatchEvent(pointerEvent("pointermove", sample(30, 40, 110)));
    expect(renderer.previewStroke).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: [41 / 255, 79 / 255, 104 / 255, 1] }),
      null,
    );

    surface.dispatchEvent(pointerEvent("pointerup", sample(40, 50, 120)));
    expect(committed).toHaveLength(1);
    expect(committed[0]?.id).toBe("denim-v1");
    expect(surface.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(surface.setPointerCapture).toHaveBeenCalledWith(7);
    controller.dispose();
  });

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
    const committed = vi.mocked(repository.appendOperation).mock.calls[0]?.[0];
    expect(
      committed?.type === "stroke.committed"
        ? committed.samples.map((sample) => sample.time)
        : [],
    ).toEqual([100, 110, 120]);
    expect(renderer.clearPreview).toHaveBeenCalled();
    expect(renderer.commitStroke).toHaveBeenCalledTimes(1);
    expect(view.surface.setPointerCapture).toHaveBeenCalledWith(7);
    expect(view.surface.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(store.getSnapshot().document?.strokes).toHaveLength(1);
  });

  it("keeps the drawing controller and viewport intact while the shelf is reopened", async () => {
    const user = userEvent.setup();
    const store = await openStore(projectRepository());
    const renderer = mockRenderer();
    const viewport = mockViewport();
    const view = renderSurface(store, renderer, viewport);
    const initialSurface = view.surface;
    const initialResets = viewport.reset.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Brushes" }));
    await user.click(screen.getByRole("radio", { name: "Denim" }));
    await user.click(screen.getByRole("button", { name: "Close brushes" }));
    await user.click(screen.getByRole("button", { name: "Brushes" }));

    expect(store.getSnapshot().brush.id).toBe("denim-v1");
    expect(view.rendererFactory).toHaveBeenCalledTimes(1);
    expect(view.surface).toBe(initialSurface);
    expect(viewport.reset).toHaveBeenCalledTimes(initialResets);
  });

  it("keeps only one edge shelf open without recreating the canvas", async () => {
    const user = userEvent.setup();
    const store = await openStore(projectRepository());
    const view = renderSurface(store, mockRenderer(), mockViewport());
    const initialCanvas = view.surface;

    await user.click(screen.getByRole("button", { name: "Brushes" }));
    expect(
      screen.getByRole("complementary", { name: "Brushes" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Layers" }));

    expect(screen.queryByRole("complementary", { name: "Brushes" })).toBeNull();
    expect(screen.getByRole("complementary", { name: "Layers" })).toBeVisible();
    expect(view.surface).toBe(initialCanvas);
    expect(view.rendererFactory).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending Layers range preview when Brushes takes ownership", async () => {
    const user = userEvent.setup();
    const repository = projectRepository();
    const store = await openStore(repository);
    await store.setFoundation(
      createFoundationState({
        assetId: "neutral-figure-front",
        assetVersion: 1,
        foundationType: "figure",
        visibleLandmarkGroups: ["outline"],
      }),
    );
    repository.appendOperation.mockClear();
    const view = renderSurface(store, mockRenderer(), mockViewport());
    const initialCanvas = view.surface;

    await user.click(screen.getByRole("button", { name: "Layers" }));
    fireEvent.change(
      screen.getByRole("slider", { name: "Foundation opacity" }),
      { target: { value: "0.65" } },
    );
    expect(screen.getByTestId("foundation-transform")).toHaveAttribute(
      "opacity",
      "0.65",
    );
    expect(repository.appendOperation).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Brushes" }));

    await waitFor(() =>
      expect(screen.getByTestId("foundation-transform")).toHaveAttribute(
        "opacity",
        "0.35",
      ),
    );
    expect(repository.appendOperation).not.toHaveBeenCalled();
    expect(view.surface).toBe(initialCanvas);
    expect(view.rendererFactory).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Layers" }));
    expect(screen.getByText("35%")).toBeVisible();
    expect(repository.appendOperation).not.toHaveBeenCalled();
  });

  it("shows the untouched-project Layers cue once per editor mount", async () => {
    const user = userEvent.setup();
    const store = await openStore(projectRepository());
    renderSurface(store, mockRenderer(), mockViewport());
    const layers = screen.getByRole("button", { name: "Layers" });

    expect(layers).toHaveAttribute("data-attention", "true");
    await user.click(layers);
    expect(layers).not.toHaveAttribute("data-attention");
    await user.click(screen.getByRole("button", { name: "Close layers" }));
    expect(layers).not.toHaveAttribute("data-attention");
  });

  it("keeps open brush controls above the artwork hit target", async () => {
    const style = document.createElement("style");
    style.textContent = APP_STYLES;
    document.head.append(style);
    const user = userEvent.setup();
    const store = await openStore(projectRepository());
    const view = renderSurface(store, mockRenderer(), mockViewport());

    try {
      await user.click(screen.getByRole("button", { name: "Brushes" }));

      const shelf = view.container.querySelector(".brush-shelf");
      const canvasMount = view.container.querySelector(
        ".drawing-surface__canvas-mount",
      );
      const interaction = view.container.querySelector(
        ".foundation-overlay__interaction",
      );
      expect(shelf).not.toBeNull();
      expect(canvasMount).not.toBeNull();
      expect(interaction).not.toBeNull();
      expect(Number(getComputedStyle(interaction!).zIndex)).toBeGreaterThan(
        Number(getComputedStyle(canvasMount!).zIndex),
      );
      expect(getComputedStyle(interaction!).color).toBe("var(--color-muted)");
      expect(Number(getComputedStyle(shelf!).zIndex)).toBeGreaterThan(
        Number(getComputedStyle(interaction!).zIndex),
      );
    } finally {
      style.remove();
    }
  });

  it("keeps both shelf close controls at least 56 pixels square", async () => {
    const style = document.createElement("style");
    style.textContent = APP_STYLES;
    document.head.append(style);
    const user = userEvent.setup();
    const store = await openStore(projectRepository());
    renderSurface(store, mockRenderer(), mockViewport());

    try {
      await user.click(screen.getByRole("button", { name: "Layers" }));
      const close = screen.getByRole("button", { name: "Close layers" });
      const computed = getComputedStyle(close);

      expect(Number.parseFloat(computed.width)).toBeGreaterThanOrEqual(56);
      expect(Number.parseFloat(computed.minHeight)).toBeGreaterThanOrEqual(56);

      await user.click(screen.getByRole("button", { name: "Brushes" }));
      const brushClose = screen.getByRole("button", { name: "Close brushes" });
      const brushComputed = getComputedStyle(brushClose);

      expect(Number.parseFloat(brushComputed.width)).toBeGreaterThanOrEqual(56);
      expect(Number.parseFloat(brushComputed.minHeight)).toBeGreaterThanOrEqual(
        56,
      );
    } finally {
      style.remove();
    }
  });

  it("keeps every visible Layers control target at least 56 pixels square", async () => {
    const style = document.createElement("style");
    style.textContent = APP_STYLES;
    document.head.append(style);
    const user = userEvent.setup();
    const store = await openStore(projectRepository());
    await store.setFoundation(
      createFoundationState({
        assetId: "neutral-figure-front",
        assetVersion: 1,
        foundationType: "figure",
        visibleLandmarkGroups: ["outline", "center", "levels"],
      }),
    );
    renderSurface(store, mockRenderer(), mockViewport());

    const expectMinimumTarget = (target: Element) => {
      const computed = getComputedStyle(target);
      expect(Number.parseFloat(computed.minWidth)).toBeGreaterThanOrEqual(56);
      expect(Number.parseFloat(computed.minHeight)).toBeGreaterThanOrEqual(56);
    };

    try {
      const handle = screen.getByRole("button", { name: "Layers" });
      await user.click(handle);
      const panel = screen.getByRole("complementary", { name: "Layers" });
      const visibleTargets = [
        handle,
        ...Array.from(panel.querySelectorAll("button")),
        ...screen
          .getAllByRole("checkbox")
          .map((checkbox) => checkbox.closest("label")),
        ...screen.getAllByRole("slider"),
      ].filter((target): target is HTMLElement => target !== null);

      for (const target of visibleTargets) {
        expectMinimumTarget(target);
      }

      await user.click(
        screen.getByRole("button", { name: "Replace foundation" }),
      );
      const choices = screen.getByLabelText("Foundation choices");
      for (const choice of choices.querySelectorAll("button")) {
        expectMinimumTarget(choice);
      }
    } finally {
      style.remove();
    }
  });

  it("keeps the existing canvas and controller alive when foundation state changes", async () => {
    const store = await openStore(projectRepository());
    const renderer = mockRenderer();
    const viewport = mockViewport();
    const view = renderSurface(store, renderer, viewport);
    const initialCanvas = view.surface;

    await act(() =>
      store.setFoundation(
        createFoundationState({
          assetId: "neutral-figure-front",
          assetVersion: 1,
          foundationType: "figure",
          visibleLandmarkGroups: ["outline", "center"],
        }),
      ),
    );

    expect(view.surface).toBe(initialCanvas);
    expect(view.rendererFactory).toHaveBeenCalledTimes(1);
    expect(viewport.reset).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("foundation-outline-use")).toBeInTheDocument();
    expect(screen.queryByTestId("foundation-levels-use")).toBeNull();
  });

  it("keeps Brushes functional beside artwork when a pinned Foundation is unavailable", async () => {
    const initial = createDocument({
      projectId: "project-1",
      title: "Unavailable Foundation recovery",
    });
    const withFoundation = documentReducer(initial, {
      type: "foundation.set",
      operationId: "unavailable-foundation",
      projectId: "project-1",
      sequence: 1,
      committedAt: "2026-07-28T12:00:00.000Z",
      foundation: createFoundationState({
        assetId: "retired-foundation",
        assetVersion: 9,
        foundationType: "figure",
        visibleLandmarkGroups: ["outline", "center"],
      }),
    });
    const recovered = documentReducer(withFoundation, {
      type: "stroke.committed",
      operationId: "recovered-denim-stroke",
      projectId: "project-1",
      layerId: initial.activeLayerId,
      sequence: 2,
      committedAt: "2026-07-28T12:01:00.000Z",
      brush: getBrushPreset("denim-v1"),
      samples: [
        {
          x: 720,
          y: 920,
          pressure: 0.6,
          tiltX: 0,
          tiltY: 0,
          twist: 0,
          altitudeAngle: null,
          azimuthAngle: null,
          time: 0,
        },
        {
          x: 820,
          y: 1020,
          pressure: 0.7,
          tiltX: 0,
          tiltY: 0,
          twist: 0,
          altitudeAngle: null,
          azimuthAngle: null,
          time: 16,
        },
      ],
    });
    const repository = projectRepository();
    vi.mocked(repository.loadProject).mockResolvedValueOnce(recovered);
    const store = await openStore(repository);
    const renderer = mockRenderer();
    const view = renderSurface(store, renderer, mockViewport());
    const user = userEvent.setup();

    expect(renderer.replaceDocument).toHaveBeenCalledWith([
      expect.objectContaining({ operationId: "recovered-denim-stroke" }),
    ]);
    expect(
      view.container.querySelector("[data-foundation-missing='true']"),
    ).not.toBeNull();
    expect(
      view.container.querySelector(".drawing-surface__canvas"),
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Layers" }));
    expect(screen.getByText("Foundation unavailable")).toBeVisible();
    expect(screen.getByText("Your artwork is safe.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Brushes" }));
    expect(screen.queryByText("Foundation unavailable")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Denim" }));

    expect(store.getSnapshot().brush.id).toBe("denim-v1");
    expect(view.surface).toBeInTheDocument();

    repository.appendOperation.mockClear();
    fireEvent(
      view.surface,
      pointerEvent("pointerdown", sample(30, 40, 200, 0.45)),
    );
    fireEvent(
      view.surface,
      pointerEvent("pointermove", sample(90, 120, 216, 0.65)),
    );
    fireEvent(
      view.surface,
      pointerEvent("pointerup", sample(140, 180, 232, 0.72)),
    );

    await waitFor(() =>
      expect(repository.appendOperation).toHaveBeenCalledTimes(1),
    );
    expect(repository.appendOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "stroke.committed",
        brush: expect.objectContaining({ id: "denim-v1" }),
      }),
    );
    expect(renderer.commitStroke).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: "stroke-1",
        texture: expect.objectContaining({ kind: "denim" }),
      }),
    );
    expect(store.getSnapshot().document?.strokes).toEqual([
      expect.objectContaining({ operationId: "recovered-denim-stroke" }),
      expect.objectContaining({
        operationId: "stroke-1",
        brush: expect.objectContaining({ id: "denim-v1" }),
      }),
    ]);
  });

  it("keeps artwork mounted while a corrupt bundled Foundation becomes unavailable and Restore retries it", async () => {
    const initial = {
      ...createDocument({
        projectId: "project-1",
        title: "Bundled Foundation recovery",
      }),
      foundation: createFoundationState({
        assetId: "neutral-figure-front",
        assetVersion: 1,
        foundationType: "figure",
        visibleLandmarkGroups: ["outline", "center"],
      }),
    };
    const corrupt = {
      ok: true,
      url: "http://localhost:3000/foundations/neutral-figure-front-v1.svg",
      text: async () =>
        `<svg xmlns="http://www.w3.org/2000/svg"><symbol id="foundation-outline" /></svg>`,
    } as Response;
    const restored = {
      ok: true,
      url: "http://localhost:3000/foundations/neutral-figure-front-v1.svg",
      text: async () => `<svg xmlns="http://www.w3.org/2000/svg">
        <symbol id="foundation-outline" />
        <symbol id="foundation-center" />
        <symbol id="foundation-levels" />
        <symbol id="foundation-construction" />
      </svg>`,
    } as Response;
    const fetchAsset = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(corrupt)
      .mockResolvedValueOnce(restored);
    vi.stubGlobal("fetch", fetchAsset);
    const repository = projectRepository();
    vi.mocked(repository.loadProject).mockResolvedValueOnce(initial);
    const store = await openStore(repository);
    const renderer = mockRenderer();
    const view = renderSurface(store, renderer, mockViewport());
    const initialCanvas = view.surface;
    const user = userEvent.setup();

    await waitFor(() =>
      expect(
        view.container.querySelector("[data-foundation-missing='true']"),
      ).not.toBeNull(),
    );
    expect(view.surface).toBe(initialCanvas);
    expect(view.rendererFactory).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Layers" }));
    expect(screen.getByText("Foundation unavailable")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Restore foundation" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Replace foundation" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Restore foundation" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("foundation-outline-use")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Foundation unavailable")).toBeNull();
    expect(fetchAsset).toHaveBeenLastCalledWith(
      "http://localhost:3000/foundations/neutral-figure-front-v1.svg",
      expect.objectContaining({
        cache: "reload",
        credentials: "same-origin",
      }),
    );
    expect(view.surface).toBe(initialCanvas);
    expect(view.rendererFactory).toHaveBeenCalledTimes(1);
  });

  it("forwards fitted and subscribed viewport matrices to the overlay", async () => {
    const store = await openStore(projectRepository());
    await store.setFoundation(
      createFoundationState({
        assetId: "neutral-figure-front",
        assetVersion: 1,
        foundationType: "figure",
        visibleLandmarkGroups: ["outline"],
      }),
    );
    const renderer = mockRenderer();
    const fitted: Matrix3 = [0.25, 0, 8, 0, 0.25, 12, 0, 0, 1];
    const gesture: Matrix3 = [0.5, 0, 16, 0, 0.5, 24, 0, 0, 1];
    let listener: ((matrix: Matrix3) => void) | null = null;
    const viewport = mockViewport();
    viewport.getMatrix = vi.fn(() => fitted);
    viewport.subscribe = vi.fn((next) => {
      listener = next;
      return () => undefined;
    });

    renderSurface(store, renderer, viewport);
    expect(screen.getByTestId("foundation-transform")).toHaveAttribute(
      "transform",
      "matrix(0.25 0 0 0.25 8 12)",
    );

    act(() => listener?.(gesture));

    expect(screen.getByTestId("foundation-transform")).toHaveAttribute(
      "transform",
      "matrix(0.5 0 0 0.5 16 24)",
    );
  });

  it("commits an unlocked foundation gesture once in document space", async () => {
    const repository = projectRepository();
    const store = await openStore(repository);
    await store.setFoundation({
      ...createFoundationState({
        assetId: "neutral-figure-front",
        assetVersion: 1,
        foundationType: "figure",
        visibleLandmarkGroups: ["outline"],
      }),
      locked: false,
    });
    repository.appendOperation.mockClear();
    const renderer = mockRenderer();
    const viewport = mockViewport();
    const fitted: Matrix3 = [2, 0, 0, 0, 2, 0, 0, 0, 1];
    viewport.getMatrix = vi.fn(() => fitted);
    viewport.subscribe = vi.fn((listener) => {
      listener(fitted);
      return () => undefined;
    });
    const view = renderSurface(store, renderer, viewport);
    const interaction = view.container.querySelector(
      ".foundation-overlay__interaction",
    );
    if (!(interaction instanceof SVGSVGElement)) {
      throw new Error("Expected the foundation interaction surface.");
    }
    const hitTarget = screen.getByTestId("foundation-hit-target");

    fireEvent(
      hitTarget,
      pointerEvent("pointerdown", {
        pointerId: 7,
        pointerType: "pen",
        clientX: 100,
        clientY: 200,
      }),
    );
    fireEvent(
      hitTarget,
      pointerEvent("pointermove", {
        pointerId: 7,
        pointerType: "pen",
        clientX: 140,
        clientY: 260,
      }),
    );
    fireEvent(
      hitTarget,
      pointerEvent("pointerup", {
        pointerId: 7,
        pointerType: "pen",
        clientX: 140,
        clientY: 260,
      }),
    );

    await waitFor(() =>
      expect(repository.appendOperation).toHaveBeenCalledTimes(1),
    );
    const operation = repository.appendOperation.mock.calls[0]?.[0];
    expect(
      operation?.type === "foundation.set"
        ? operation.foundation?.transform
        : null,
    ).toEqual([1, 0, 20, 0, 1, 30, 0, 0, 1]);
    expect(store.getSnapshot().document?.foundation?.transform).toEqual([
      1, 0, 20, 0, 1, 30, 0, 0, 1,
    ]);
    expect(renderer.previewStroke).not.toHaveBeenCalled();
    expect(viewport.onPointerDown).not.toHaveBeenCalled();
  });

  it("commits a mouse stroke with stable fallback pressure", async () => {
    const repository = projectRepository();
    const store = await openStore(repository);
    const view = renderSurface(store, mockRenderer(), mockViewport());

    fireEvent(
      view.surface,
      pointerEvent("pointerdown", sample(10, 20, 100, 0, "mouse")),
    );
    fireEvent(
      view.surface,
      pointerEvent("pointermove", sample(30, 40, 110, 0, "mouse")),
    );
    fireEvent(
      view.surface,
      pointerEvent("pointerup", sample(50, 60, 120, 0, "mouse")),
    );

    await waitFor(() =>
      expect(repository.appendOperation).toHaveBeenCalledTimes(1),
    );
    const operation = repository.appendOperation.mock.calls[0]?.[0];
    expect(operation?.type).toBe("stroke.committed");
    if (operation?.type === "stroke.committed") {
      expect(operation.samples.map((entry) => entry.pressure)).toEqual([
        0.5, 0.5, 0.5,
      ]);
    }
  });

  it("leaves locked foundation Pencil and touch contacts to the canvas", async () => {
    const repository = projectRepository();
    const store = await openStore(repository);
    await store.setFoundation(
      createFoundationState({
        assetId: "neutral-figure-front",
        assetVersion: 1,
        foundationType: "figure",
        visibleLandmarkGroups: ["outline"],
      }),
    );
    repository.appendOperation.mockClear();
    const renderer = mockRenderer();
    const viewport = mockViewport();
    const view = renderSurface(store, renderer, viewport);
    const interaction = view.container.querySelector(
      ".foundation-overlay__interaction",
    );

    expect(interaction).toHaveStyle({ pointerEvents: "none" });
    fireEvent(view.surface, pointerEvent("pointerdown", sample(10, 20, 100)));
    fireEvent(view.surface, pointerEvent("pointermove", sample(30, 40, 110)));
    expect(renderer.previewStroke).toHaveBeenCalled();

    const touch = {
      pointerId: 3,
      pointerType: "touch",
      clientX: 60,
      clientY: 70,
      width: 18,
      height: 20,
      timeStamp: 120,
    };
    fireEvent(view.surface, pointerEvent("pointerdown", touch));
    fireEvent(view.surface, pointerEvent("pointermove", touch));
    fireEvent(view.surface, pointerEvent("pointerup", touch));
    expect(viewport.onPointerDown).toHaveBeenCalledTimes(1);
    expect(viewport.onPointerMove).toHaveBeenCalledTimes(1);
    expect(viewport.onPointerUp).toHaveBeenCalledTimes(1);
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

  it("normalizes offset-surface Pencil and touch contacts into one local space", async () => {
    const store = await openStore(projectRepository());
    const viewport = mockViewport();
    let getActivePencilContact:
      | Parameters<DrawingViewportFactory>[0]["getActivePencilContact"]
      | undefined;
    const view = renderSurface(store, mockRenderer(), viewport, {
      bounds: { left: 100, top: 50, width: 640, height: 480 },
      onViewportOptions: (options) => {
        getActivePencilContact = options.getActivePencilContact;
      },
    });

    fireEvent(view.surface, pointerEvent("pointerdown", sample(150, 100, 100)));
    expect(getActivePencilContact?.()).toEqual({ x: 50, y: 50 });

    fireEvent(
      view.surface,
      pointerEvent("pointerdown", {
        pointerId: 3,
        pointerType: "touch",
        clientX: 155,
        clientY: 105,
        width: 60,
        height: 50,
      }),
    );
    fireEvent(
      view.surface,
      pointerEvent("pointermove", {
        pointerId: 3,
        pointerType: "touch",
        clientX: 175,
        clientY: 125,
        width: 60,
        height: 50,
      }),
    );

    expect(viewport.onPointerDown).toHaveBeenCalledWith(
      expect.objectContaining({ clientX: 55, clientY: 55 }),
    );
    expect(viewport.onPointerMove).toHaveBeenCalledWith(
      expect.objectContaining({ clientX: 75, clientY: 75 }),
    );
  });

  it("keeps an offset-canvas pinch anchored without a coordinate-space jump", () => {
    const surface = document.createElement("canvas");
    surface.setPointerCapture = vi.fn();
    surface.releasePointerCapture = vi.fn();
    surface.getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 50,
      x: 100,
      y: 50,
      width: 640,
      height: 480,
      right: 740,
      bottom: 530,
      toJSON: () => undefined,
    })) as unknown as typeof surface.getBoundingClientRect;
    const renderer = mockRenderer();
    let nextFrame = 0;
    const frames = new Map<number, FrameRequestCallback>();
    const controller = createDrawingController({
      surface,
      renderer,
      document: createDocument({
        projectId: "project-1",
        title: "Offset pinch",
      }),
      commitStroke: vi.fn(),
      commitErase: () => undefined,
      getBrush: () => getBrushPreset("studio-pencil-v1"),
      getTool: () => "brush",
      getEraser: () => createEraserSnapshot(getBrushPreset("studio-pencil-v1")),
      requestFrame: (callback) => {
        const id = ++nextFrame;
        frames.set(id, callback);
        return id;
      },
      cancelFrame: (id) => frames.delete(id),
    });
    const flushFrames = () => {
      while (frames.size > 0) {
        const pending = [...frames.entries()];
        frames.clear();
        for (const [, callback] of pending) callback(0);
      }
    };
    flushFrames();
    const baseline = vi.mocked(renderer.setViewport).mock.lastCall?.[0];
    if (!baseline) throw new Error("Expected an initial viewport matrix.");

    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 1,
        pointerType: "touch",
        clientX: 200,
        clientY: 150,
        width: 10,
        height: 10,
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 2,
        pointerType: "touch",
        clientX: 300,
        clientY: 150,
        width: 10,
        height: 10,
      }),
    );
    expect(vi.mocked(renderer.setViewport).mock.lastCall?.[0]).toEqual(
      baseline,
    );

    surface.dispatchEvent(
      pointerEvent("pointermove", {
        pointerId: 1,
        pointerType: "touch",
        clientX: 175,
        clientY: 150,
        width: 10,
        height: 10,
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointermove", {
        pointerId: 2,
        pointerType: "touch",
        clientX: 325,
        clientY: 150,
        width: 10,
        height: 10,
      }),
    );
    flushFrames();

    const next = vi.mocked(renderer.setViewport).mock.lastCall?.[0];
    if (!next) throw new Error("Expected a gesture viewport matrix.");
    const localCentroid = { x: 150, y: 100 };
    const anchoredDocumentPoint = transformPoint(
      invert(baseline),
      localCentroid,
    );
    const transformedAnchor = transformPoint(next, anchoredDocumentPoint);
    expect(transformedAnchor.x).toBeCloseTo(localCentroid.x, 8);
    expect(transformedAnchor.y).toBeCloseTo(localCentroid.y, 8);
    controller.dispose();
  });

  it("coalesces a stroke commit render and schedules a repaint for undo", async () => {
    let nextFrame = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const flushFrames = () => {
      while (frames.size > 0) {
        const pending = [...frames.entries()];
        frames.clear();
        for (const [, callback] of pending) callback(0);
      }
    };
    const store = await openStore(projectRepository());
    const renderer = mockRenderer();
    const view = renderSurface(store, renderer, mockViewport());
    flushFrames();
    renderer.render.mockClear();

    fireEvent(view.surface, pointerEvent("pointerdown", sample(10, 20, 100)));
    fireEvent(view.surface, pointerEvent("pointerup", sample(30, 40, 110)));
    flushFrames();
    expect(renderer.render).toHaveBeenCalledTimes(1);

    renderer.render.mockClear();
    await userEvent.click(
      screen.getByRole("button", { name: "Undo last mark" }),
    );
    flushFrames();
    expect(renderer.render).toHaveBeenCalledTimes(1);
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

  it("exposes the active canvas and an append-only Undo last mark control", async () => {
    const user = userEvent.setup();
    const repository = projectRepository();
    const store = await openStore(repository);
    const renderer = mockRenderer();
    const view = renderSurface(store, renderer, mockViewport());

    expect(view.surface).toHaveAccessibleName(
      "Drawing canvas for Linen Wrap Study",
    );
    expect(view.surface).toHaveFocus();
    const undo = screen.getByRole("button", { name: "Undo last mark" });
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
