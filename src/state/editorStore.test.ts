import { describe, expect, it, vi } from "vitest";
import { createDocument } from "../domain/document/createDocument";
import { documentReducer } from "../domain/document/documentReducer";
import type {
  DesignDocument,
  DocumentOperation,
  PenSample,
  StrokeOperation,
} from "../domain/document/types";
import type { Renderer } from "../engine/render/Renderer";
import type {
  ProjectRepository,
  ProjectSummary,
} from "../platform/persistence/types";
import { createEditorStore } from "./editorStore";

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
    },
    samples,
    ...overrides,
  };
}

describe("EditorStore", () => {
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

    await store.commitStroke(samples);

    expect(store.getSnapshot()).toMatchObject({
      saveStatus: "error",
      document: { strokes: [{ operationId: "stroke-1" }] },
    });

    await store.retrySave();

    const appends = vi.mocked(projectRepository.appendOperation).mock.calls;
    expect(appends).toHaveLength(2);
    expect(appends[0]?.[0].operationId).toBe("stroke-1");
    expect(appends[1]?.[0].operationId).toBe("stroke-1");
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

    expect(measure).toHaveBeenCalledWith("stroke-durability", {
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
});
