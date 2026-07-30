import { describe, expect, it, vi } from "vitest";
import { createDocument } from "../domain/document/createDocument";
import { documentReducer } from "../domain/document/documentReducer";
import type {
  DesignDocument,
  DocumentOperation,
  FoundationLandmarkGroup,
  FoundationState,
  PenSample,
  StrokeOperation,
} from "../domain/document/types";
import type { Renderer } from "../engine/render/Renderer";
import type {
  ProjectRepository,
  ProjectSummary,
} from "../platform/persistence/types";
import { getBrushPreset } from "../engine/brush/presets";
import { createEditorStore, toRenderStroke } from "./editorStore";

const samples: readonly PenSample[] = [
  {
    x: 10,
    y: 20,
    pressure: 0.4,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    altitudeAngle: null,
    azimuthAngle: null,
    time: 100,
  },
  {
    x: 30,
    y: 45,
    pressure: 0.8,
    tiltX: 12,
    tiltY: -4,
    twist: 0,
    altitudeAngle: null,
    azimuthAngle: null,
    time: 110,
  },
];

const figure: FoundationState = {
  assetId: "neutral-figure-front",
  assetVersion: 1,
  foundationType: "figure",
  transform: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  opacity: 0.34,
  visible: true,
  visibleLandmarkGroups: ["outline"],
  locked: true,
  includeInExport: false,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function repository(
  overrides: Partial<ProjectRepository> = {},
): ProjectRepository {
  return {
    listProjects: vi.fn(async () => [] as readonly ProjectSummary[]),
    createProject: vi.fn(async () => undefined),
    loadProject: vi.fn(async () => createDocumentFixture()),
    appendOperation: vi.fn(async () => undefined),
    writeSnapshot: vi.fn(async () => undefined),
    deleteProject: vi.fn(async () => undefined),
    ...overrides,
  };
}

function renderer(): Renderer {
  return {
    kind: "webgl2",
    resize: vi.fn(),
    setViewport: vi.fn(),
    replaceDocument: vi.fn(),
    previewStroke: vi.fn(),
    commitStroke: vi.fn(),
    clearPreview: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  };
}

function createDocumentFixture(
  projectId = "project-1",
  title = "Linen Study",
): DesignDocument {
  return createDocument({ projectId, title });
}

function recoveredDocument(): DesignDocument {
  return documentReducer(createDocumentFixture(), stroke());
}

function stroke(overrides: Partial<StrokeOperation> = {}): StrokeOperation {
  return {
    type: "stroke.committed",
    operationId: "recovered-stroke",
    projectId: "project-1",
    layerId: "paint-layer:project-1",
    sequence: 1,
    committedAt: "2026-07-21T12:00:00.000Z",
    brush: {
      id: "studio-pencil-v1",
      color: "#262421",
      opacity: 0.78,
      size: 16,
      pressureSize: 1,
      pressureOpacity: 0.65,
      tiltShape: 0.4,
      texture: {
        kind: "graphite",
        scale: 18,
        strength: 0.34,
        angle: 0,
        scatter: 0.18,
      },
    },
    samples,
    ...overrides,
  };
}

describe("EditorStore", () => {
  it("selects a catalog brush and snapshots it into queued operations", async () => {
    const operations: DocumentOperation[] = [];
    const store = createEditorStore({
      repository: repository({
        appendOperation: vi.fn(async (operation) => {
          operations.push(operation);
        }),
      }),
      createId: () => "stroke-1",
    });
    await store.openProject("project-1");

    store.selectBrush("denim-v1");
    expect(store.getSnapshot().brush.id).toBe("denim-v1");
    expect(store.getActiveBrush()).toEqual(getBrushPreset("denim-v1"));
    await store.commitStroke(samples);

    const operation = operations.find(
      (candidate): candidate is StrokeOperation =>
        candidate.type === "stroke.committed",
    );

    expect(operation?.brush).toEqual(getBrushPreset("denim-v1"));
    store.selectBrush("silk-v1");
    expect(operation?.brush.id).toBe("denim-v1");
  });

  it("uses a pencil-down brush capture for both persistence and rendering", async () => {
    const activeRenderer = renderer();
    const operations: DocumentOperation[] = [];
    const store = createEditorStore({
      repository: repository({
        appendOperation: vi.fn(async (operation) => {
          operations.push(operation);
        }),
      }),
      renderer: activeRenderer,
      createId: () => "stroke-1",
    });
    await store.openProject("project-1");
    const captured = getBrushPreset("wool-v1");
    store.selectBrush("silk-v1");

    await store.commitStroke(samples, captured);

    expect(operations[0]).toMatchObject({ brush: captured });
    expect(activeRenderer.commitStroke).toHaveBeenCalledWith(
      expect.objectContaining({ texture: captured.texture }),
    );
  });

  it("persists a new project before navigating to its editor", async () => {
    const persisted = deferred<void>();
    const projectRepository = repository({
      createProject: vi.fn(() => persisted.promise),
    });
    const store = createEditorStore({
      repository: projectRepository,
      createId: () => "project-1",
      now: () => "2026-07-21T12:00:00.000Z",
    });

    const opening = store.createProject();

    expect(projectRepository.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1" }),
    );
    expect(store.getSnapshot().view).toBe("gallery");

    persisted.resolve();
    await opening;

    expect(store.getSnapshot()).toMatchObject({
      view: "editor",
      document: { projectId: "project-1" },
    });
  });

  it("creates a project when randomUUID is unavailable on a LAN origin", async () => {
    const getRandomValues = vi.fn((values: Uint8Array) => {
      values.forEach((_, index) => {
        values[index] = index;
      });
      return values;
    });
    vi.stubGlobal("crypto", { getRandomValues });
    const projectRepository = repository();

    try {
      const store = createEditorStore({
        repository: projectRepository,
        now: () => "2026-07-21T12:00:00.000Z",
      });

      await expect(store.createProject()).resolves.toBeUndefined();

      expect(getRandomValues).toHaveBeenCalledTimes(1);
      expect(projectRepository.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "00010203-0405-4607-8809-0a0b0c0d0e0f",
        }),
      );
      expect(store.getSnapshot()).toMatchObject({
        view: "editor",
        navigationBusy: false,
        document: {
          projectId: "00010203-0405-4607-8809-0a0b0c0d0e0f",
        },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("releases navigation when project ID creation fails", async () => {
    const store = createEditorStore({
      repository: repository(),
      createId: () => {
        throw new Error("ID generation unavailable");
      },
    });

    await expect(store.createProject()).rejects.toThrow(
      "ID generation unavailable",
    );

    expect(store.getSnapshot()).toMatchObject({
      view: "gallery",
      navigationBusy: false,
      document: null,
    });
  });

  it("replays a recovered document into the active renderer when opened", async () => {
    const activeRenderer = renderer();
    const projectRepository = repository({
      loadProject: vi.fn(async () => recoveredDocument()),
    });
    const store = createEditorStore({
      repository: projectRepository,
      renderer: activeRenderer,
    });

    await store.openProject("project-1");

    expect(activeRenderer.replaceDocument).toHaveBeenCalledTimes(1);
    expect(activeRenderer.replaceDocument).toHaveBeenCalledWith([
      expect.objectContaining({ operationId: "recovered-stroke" }),
    ]);
    store.selectBrush("silk-v1");
    expect(store.getSnapshot().document?.strokes[0]?.brush).toEqual(
      getBrushPreset("studio-pencil-v1"),
    );
  });

  it("copies the operation texture into the renderer boundary", () => {
    const operation = stroke({ brush: getBrushPreset("knit-v1") });

    expect(toRenderStroke(operation).texture).toEqual(operation.brush.texture);
    expect(toRenderStroke(operation).texture).not.toBe(operation.brush.texture);
  });

  it("updates memory immediately, appends once, and reports saving then saved", async () => {
    const append = deferred<void>();
    const projectRepository = repository({
      appendOperation: vi.fn(() => append.promise),
    });
    const activeRenderer = renderer();
    const store = createEditorStore({
      repository: projectRepository,
      renderer: activeRenderer,
      createId: () => "stroke-1",
      now: () => "2026-07-21T12:00:00.000Z",
    });
    await store.openProject("project-1");
    const statuses: string[] = [];
    store.subscribe(() => statuses.push(store.getSnapshot().saveStatus));

    const saving = store.commitStroke(samples);

    expect(store.getSnapshot().document?.strokes).toHaveLength(1);
    expect(store.getSnapshot().saveStatus).toBe("saving");
    expect(activeRenderer.commitStroke).toHaveBeenCalledTimes(1);
    expect(projectRepository.appendOperation).toHaveBeenCalledTimes(1);

    append.resolve();
    await saving;

    expect(store.getSnapshot().saveStatus).toBe("saved");
    expect(statuses).toEqual(expect.arrayContaining(["saving", "saved"]));
  });

  it("updates the visible foundation immediately and appends it once", async () => {
    const append = deferred<void>();
    const projectRepository = repository({
      appendOperation: vi.fn(() => append.promise),
    });
    const activeRenderer = renderer();
    const store = createEditorStore({
      repository: projectRepository,
      renderer: activeRenderer,
      createId: () => "foundation-1",
      now: () => "2026-07-21T12:00:00.000Z",
    });
    await store.openProject("project-1");
    const rendererMethods = [
      activeRenderer.resize,
      activeRenderer.setViewport,
      activeRenderer.replaceDocument,
      activeRenderer.previewStroke,
      activeRenderer.commitStroke,
      activeRenderer.clearPreview,
      activeRenderer.render,
      activeRenderer.dispose,
    ];
    rendererMethods.forEach((method) => vi.mocked(method).mockClear());

    const saving = store.setFoundation(figure);

    expect(store.getSnapshot()).toMatchObject({
      saveStatus: "saving",
      document: { foundation: figure },
    });
    expect(projectRepository.appendOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "foundation.set",
        sequence: 1,
        foundation: figure,
      }),
    );
    rendererMethods.forEach((method) => {
      expect(method).not.toHaveBeenCalled();
    });

    append.resolve();
    await saving;

    expect(store.getSnapshot().saveStatus).toBe("saved");
    expect(projectRepository.appendOperation).toHaveBeenCalledTimes(1);
  });

  it("retries the same immutable foundation operation after failure", async () => {
    const projectRepository = repository({
      appendOperation: vi
        .fn<(operation: DocumentOperation) => Promise<void>>()
        .mockRejectedValueOnce(new Error("disk full"))
        .mockResolvedValueOnce(undefined),
    });
    const callerFoundation = {
      ...figure,
      transform: [1, 0, 12, 0, 1, 24, 0, 0, 1] as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ],
      visibleLandmarkGroups: ["outline"] as FoundationLandmarkGroup[],
    };
    const store = createEditorStore({
      repository: projectRepository,
      createId: () => "foundation-1",
      now: () => "2026-07-21T12:00:00.000Z",
    });
    await store.openProject("project-1");

    await store.setFoundation(callerFoundation);
    callerFoundation.transform[2] = 999;
    callerFoundation.visibleLandmarkGroups.push("center");
    await store.retrySave();

    const calls = vi.mocked(projectRepository.appendOperation).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[0]).toBe(calls[1]?.[0]);
    expect(calls[0]?.[0]).toMatchObject({
      foundation: {
        transform: [1, 0, 12, 0, 1, 24, 0, 0, 1],
        visibleLandmarkGroups: ["outline"],
      },
    });
    expect(store.getSnapshot().document?.foundation).toMatchObject({
      transform: [1, 0, 12, 0, 1, 24, 0, 0, 1],
      visibleLandmarkGroups: ["outline"],
    });
  });

  it("keeps failed art in memory and retries the same operation without rerendering", async () => {
    const projectRepository = repository({
      appendOperation: vi
        .fn<(operation: DocumentOperation) => Promise<void>>()
        .mockRejectedValueOnce(new Error("disk full"))
        .mockResolvedValueOnce(undefined),
    });
    const activeRenderer = renderer();
    const store = createEditorStore({
      repository: projectRepository,
      renderer: activeRenderer,
      createId: () => "stroke-1",
      now: () => "2026-07-21T12:00:00.000Z",
    });
    await store.openProject("project-1");
    store.selectBrush("denim-v1");

    await store.commitStroke(samples);

    expect(store.getSnapshot()).toMatchObject({
      saveStatus: "error",
      document: { strokes: [{ operationId: "stroke-1" }] },
    });
    store.selectBrush("silk-v1");

    await store.retrySave();

    const appends = vi.mocked(projectRepository.appendOperation).mock.calls;
    expect(appends).toHaveLength(2);
    expect(appends[0]?.[0].operationId).toBe("stroke-1");
    expect(appends[1]?.[0].operationId).toBe("stroke-1");
    expect(appends[0]?.[0]).toBe(appends[1]?.[0]);
    expect(appends[1]?.[0]).toMatchObject({
      brush: getBrushPreset("denim-v1"),
    });
    expect(store.getSnapshot().document?.strokes).toHaveLength(1);
    expect(activeRenderer.commitStroke).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().saveStatus).toBe("saved");
  });

  it("blocks Back after a failed append, then closes after retry succeeds", async () => {
    const projectRepository = repository({
      appendOperation: vi
        .fn<(operation: DocumentOperation) => Promise<void>>()
        .mockRejectedValueOnce(new Error("disk full"))
        .mockResolvedValueOnce(undefined),
    });
    const confirmClose = vi.fn().mockResolvedValue(true);
    const store = createEditorStore({
      repository: projectRepository,
      createId: () => "stroke-1",
      confirmClose,
    });
    await store.openProject("project-1");

    await store.commitStroke(samples);
    await store.closeProject();

    expect(confirmClose).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toMatchObject({
      view: "editor",
      saveStatus: "error",
      saveError: "disk full",
      document: { strokes: [{ operationId: "stroke-1" }] },
    });

    await store.retrySave();
    await store.closeProject();

    expect(store.getSnapshot()).toMatchObject({
      view: "gallery",
      saveStatus: "saved",
      document: null,
    });
  });

  it("waits for a confirmed in-flight append and stays open when it fails", async () => {
    const append = deferred<void>();
    const confirmClose = vi.fn().mockResolvedValue(true);
    const store = createEditorStore({
      repository: repository({ appendOperation: vi.fn(() => append.promise) }),
      createId: () => "stroke-1",
      confirmClose,
    });
    await store.openProject("project-1");
    const saving = store.commitStroke(samples);
    const closing = store.closeProject();

    expect(confirmClose).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().view).toBe("editor");

    append.reject(new Error("device removed"));
    await Promise.all([saving, closing]);

    expect(store.getSnapshot()).toMatchObject({
      view: "editor",
      saveStatus: "error",
      saveError: "device removed",
      document: { strokes: [{ operationId: "stroke-1" }] },
    });
  });

  it.each(["success", "failure"] as const)(
    "isolates an old project's %s completion from the active project",
    async (outcome) => {
      const projectAAppend = deferred<void>();
      const projectBAppend = deferred<void>();
      const projectRepository = repository({
        loadProject: vi.fn(async (projectId) =>
          createDocumentFixture(projectId, `Project ${projectId}`),
        ),
        appendOperation: vi.fn((operation: DocumentOperation) =>
          operation.projectId === "project-a"
            ? projectAAppend.promise
            : projectBAppend.promise,
        ),
      });
      const ids = ["stroke-a", "stroke-b"];
      const store = createEditorStore({
        repository: projectRepository,
        createId: () => ids.shift() ?? "unexpected-id",
      });
      await store.openProject("project-a");
      const savingA = store.commitStroke(samples);
      await store.openProject("project-b");
      const savingB = store.commitStroke(samples);

      if (outcome === "success") {
        projectAAppend.resolve();
      } else {
        projectAAppend.reject(new Error("A failed"));
      }
      await savingA;

      expect(store.getSnapshot()).toMatchObject({
        view: "editor",
        saveStatus: "saving",
        saveError: null,
        document: { projectId: "project-b" },
      });

      projectBAppend.resolve();
      await savingB;
      expect(store.getSnapshot()).toMatchObject({
        saveStatus: "saved",
        saveError: null,
        document: { projectId: "project-b" },
      });
    },
  );

  it("lets the latest open win when project loads resolve out of order", async () => {
    const projectA = deferred<DesignDocument>();
    const projectB = deferred<DesignDocument>();
    const activeRenderer = renderer();
    const store = createEditorStore({
      repository: repository({
        loadProject: vi.fn((projectId) =>
          projectId === "project-a" ? projectA.promise : projectB.promise,
        ),
      }),
      renderer: activeRenderer,
    });

    const openingA = store.openProject("project-a");
    const openingB = store.openProject("project-b");
    expect(store.getSnapshot().navigationBusy).toBe(true);

    projectB.resolve(createDocumentFixture("project-b", "B"));
    await openingB;
    projectA.resolve(createDocumentFixture("project-a", "A"));
    await openingA;

    expect(store.getSnapshot()).toMatchObject({
      navigationBusy: false,
      document: { projectId: "project-b" },
    });
    expect(activeRenderer.replaceDocument).toHaveBeenCalledTimes(1);
  });

  it("does not let a stale create replace a newer open", async () => {
    const creating = deferred<void>();
    const activeRenderer = renderer();
    const store = createEditorStore({
      repository: repository({
        createProject: vi.fn(() => creating.promise),
        loadProject: vi.fn(async () =>
          createDocumentFixture("project-b", "Project B"),
        ),
      }),
      renderer: activeRenderer,
      createId: () => "project-a",
    });

    const create = store.createProject("Project A");
    const open = store.openProject("project-b");
    await open;
    creating.resolve();
    await create;

    expect(store.getSnapshot()).toMatchObject({
      navigationBusy: false,
      document: { projectId: "project-b" },
    });
    expect(activeRenderer.replaceDocument).toHaveBeenCalledTimes(1);
  });

  it("shares overlapping retry waves and retries each failed operation once", async () => {
    const retryFirst = deferred<void>();
    const retrySecond = deferred<void>();
    const appendOperation = vi
      .fn<(operation: DocumentOperation) => Promise<void>>()
      .mockRejectedValueOnce(new Error("first failed"))
      .mockRejectedValueOnce(new Error("second failed"))
      .mockImplementationOnce(() => retryFirst.promise)
      .mockImplementationOnce(() => retrySecond.promise);
    const ids = ["stroke-1", "stroke-2"];
    const store = createEditorStore({
      repository: repository({ appendOperation }),
      createId: () => ids.shift() ?? "unexpected-id",
    });
    await store.openProject("project-1");
    await store.commitStroke(samples);
    await store.commitStroke(samples);

    const firstWave = store.retrySave();
    const overlappingWave = store.retrySave();
    expect(appendOperation).toHaveBeenCalledTimes(3);

    retryFirst.resolve();
    await vi.waitFor(() => expect(appendOperation).toHaveBeenCalledTimes(4));
    retrySecond.resolve();
    await Promise.all([firstWave, overlappingWave]);

    expect(
      appendOperation.mock.calls.map(([operation]) => operation.operationId),
    ).toEqual(["stroke-1", "stroke-2", "stroke-1", "stroke-2"]);
    expect(store.getSnapshot().saveStatus).toBe("saved");
  });

  it("requests repaint for replay and undo but not for stroke commit", async () => {
    const activeRenderer = renderer();
    const requestRender = vi.fn();
    const ids = ["stroke-1", "undo-1"];
    const store = createEditorStore({
      repository: repository({
        loadProject: vi.fn(async () => recoveredDocument()),
      }),
      createId: () => ids.shift() ?? "unexpected-id",
    });
    store.attachRenderer(activeRenderer, requestRender);

    await store.openProject("project-1");
    expect(requestRender).toHaveBeenCalledTimes(1);

    await store.commitStroke(samples);
    expect(requestRender).toHaveBeenCalledTimes(1);

    await store.undoLastStroke();
    expect(requestRender).toHaveBeenCalledTimes(2);
  });

  it("measures append latency that exceeds the durability budget", async () => {
    const measure = vi.fn();
    const timestamps = [100, 351];
    const store = createEditorStore({
      repository: repository(),
      createId: () => "stroke-1",
      performance: {
        now: () => timestamps.shift() ?? 351,
        measure,
      },
    });
    await store.openProject("project-1");

    await store.commitStroke(samples);

    expect(measure).toHaveBeenCalledWith("operation-durability", {
      start: 100,
      duration: 251,
    });
  });

  it("does not turn a completed append into a save error when diagnostics fail", async () => {
    const timestamps = [100, 351];
    const store = createEditorStore({
      repository: repository(),
      createId: () => "stroke-1",
      performance: {
        now: () => timestamps.shift() ?? 351,
        measure: () => {
          throw new Error("performance entry buffer unavailable");
        },
      },
    });
    await store.openProject("project-1");

    await expect(store.commitStroke(samples)).resolves.toBeUndefined();

    expect(store.getSnapshot().saveStatus).toBe("saved");
  });

  it("edits the active brush and records recent colors", () => {
    const store = createEditorStore({ repository: repository() });

    store.selectBrush("silk-v1");
    store.setBrushSize(72);
    store.setBrushOpacity(0.25);
    store.setBrushColor("#2E4A3C");

    const brush = store.getActiveBrush();
    expect(brush.id).toBe("silk-v1");
    expect(brush.size).toBe(72);
    expect(brush.opacity).toBe(0.25);
    expect(brush.color).toBe("#2e4a3c");
    expect(brush.texture).toEqual(getBrushPreset("silk-v1").texture);
    expect(store.getSnapshot().recentColors).toEqual(["#2e4a3c"]);
  });

  it("resets the active brush to its preset defaults without clearing recents", () => {
    const store = createEditorStore({ repository: repository() });

    store.selectBrush("wool-v1");
    store.setBrushColor("#2E4A3C");
    store.setBrushSize(200);
    store.resetBrush();

    expect(store.getActiveBrush()).toEqual(getBrushPreset("wool-v1"));
    expect(store.getSnapshot().recentColors).toEqual(["#2e4a3c"]);
  });

  it("commits a stroke with the edited brush, not the bare preset", async () => {
    const operations: DocumentOperation[] = [];
    const store = createEditorStore({
      repository: repository({
        appendOperation: vi.fn(async (operation) => {
          operations.push(operation);
        }),
      }),
      createId: () => "stroke-1",
    });
    await store.openProject("project-1");

    store.selectBrush("denim-v1");
    store.setBrushSize(90);
    await store.commitStroke(samples);

    expect(operations[0]).toMatchObject({
      type: "stroke.committed",
      brush: { id: "denim-v1", size: 90 },
    });
  });

  it("commits an erase carrying the active brush tip", async () => {
    const operations: DocumentOperation[] = [];
    const store = createEditorStore({
      repository: repository({
        appendOperation: vi.fn(async (operation) => {
          operations.push(operation);
        }),
      }),
      createId: () => "erase-1",
    });
    await store.openProject("project-1");

    store.selectBrush("denim-v1");
    store.setBrushSize(64);
    store.setTool("eraser");
    await store.commitErase(samples, store.getActiveEraser());

    expect(store.getSnapshot().tool).toBe("eraser");
    expect(operations[0]).toMatchObject({
      type: "erase.committed",
      eraser: { tipBrushId: "denim-v1", size: 64 },
    });
    expect(store.getSnapshot().document?.strokes).toEqual([]);
    expect(store.getSnapshot().document?.erases).toHaveLength(1);
  });

  it("defaults to the brush tool and reports the active tool", () => {
    const store = createEditorStore({ repository: repository() });

    expect(store.getActiveTool()).toBe("brush");
    expect(store.getSnapshot().tool).toBe("brush");

    store.setTool("eraser");

    expect(store.getActiveTool()).toBe("eraser");
  });

  it("renders paint and erase marks with their own compositing", async () => {
    const activeRenderer = renderer();
    let nextId = 0;
    const store = createEditorStore({
      repository: repository(),
      renderer: activeRenderer,
      createId: () => `mark-${(nextId += 1)}`,
    });
    await store.openProject("project-1");

    await store.commitStroke(samples);
    await store.commitErase(samples, store.getActiveEraser());

    expect(
      vi
        .mocked(activeRenderer.commitStroke)
        .mock.calls.map(([mark]) => mark.composite),
    ).toEqual(["paint", "erase"]);
  });

  it("replays strokes and erases in commit order when a renderer attaches", async () => {
    let nextId = 0;
    const store = createEditorStore({
      repository: repository(),
      createId: () => `mark-${(nextId += 1)}`,
    });
    await store.openProject("project-1");
    await store.commitStroke(samples);
    await store.commitErase(samples, store.getActiveEraser());

    const activeRenderer = renderer();
    store.attachRenderer(activeRenderer);

    const replayed =
      vi.mocked(activeRenderer.replaceDocument).mock.lastCall?.[0] ?? [];
    expect(replayed.map((mark) => mark.composite)).toEqual(["paint", "erase"]);
  });
});
