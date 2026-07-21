import { buildStrokeMesh } from "../engine/brush/buildStrokeMesh";
import type { Renderer, RenderStroke } from "../engine/render/Renderer";
import { createDocument } from "../domain/document/createDocument";
import { documentReducer } from "../domain/document/documentReducer";
import type {
  BrushSnapshot,
  DesignDocument,
  DocumentOperation,
  PenSample,
  StrokeOperation,
  StrokeVisibilityOperation,
} from "../domain/document/types";
import type {
  ProjectRepository,
  ProjectSummary,
} from "../platform/persistence/types";

export type EditorSaveStatus = "saved" | "saving" | "error";

export type EditorSnapshot = Readonly<{
  view: "gallery" | "editor";
  projects: readonly ProjectSummary[];
  document: DesignDocument | null;
  saveStatus: EditorSaveStatus;
  saveError: string | null;
  navigationBusy: boolean;
}>;

export type EditorPerformance = Readonly<{
  now: () => number;
  measure: (
    name: string,
    options: Readonly<{ start: number; duration: number }>,
  ) => void;
}>;

export type EditorStoreOptions = Readonly<{
  repository: ProjectRepository;
  renderer?: Renderer;
  createId?: () => string;
  now?: () => string;
  performance?: EditorPerformance;
  confirmClose?: () => boolean | Promise<boolean>;
  brush?: BrushSnapshot;
}>;

type PendingWrite = {
  operation: DocumentOperation;
  state: "saving" | "error";
  startedAt: number;
  error: string | null;
  attempt: Promise<void> | null;
};

const DURABILITY_BUDGET_MS = 250;

export const studioPencil: BrushSnapshot = Object.freeze({
  id: "studio-pencil-v1",
  color: "#262421",
  opacity: 0.78,
  size: 16,
  pressureSize: 1,
  pressureOpacity: 0.65,
  tiltShape: 0.4,
});

export class EditorStore {
  readonly #repository: ProjectRepository;
  readonly #createId: () => string;
  readonly #now: () => string;
  readonly #performance: EditorPerformance;
  readonly #confirmClose: () => boolean | Promise<boolean>;
  readonly #brush: BrushSnapshot;
  readonly #listeners = new Set<() => void>();
  readonly #pendingWrites = new Map<string, Map<string, PendingWrite>>();
  readonly #retryWaves = new Map<string, Promise<void>>();
  readonly #documents = new Map<string, DesignDocument>();
  #renderer: Renderer | null;
  #requestRender: () => void = () => undefined;
  #navigationGeneration = 0;
  #snapshot: EditorSnapshot = Object.freeze({
    view: "gallery",
    projects: Object.freeze([] as ProjectSummary[]),
    document: null,
    saveStatus: "saved",
    saveError: null,
    navigationBusy: false,
  });

  public constructor(options: EditorStoreOptions) {
    this.#repository = options.repository;
    this.#renderer = options.renderer ?? null;
    this.#createId = options.createId ?? defaultId;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#performance = options.performance ?? defaultPerformance();
    this.#confirmClose = options.confirmClose ?? defaultConfirmClose;
    this.#brush = options.brush ?? studioPencil;
  }

  public getSnapshot = (): EditorSnapshot => this.#snapshot;

  public subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  public async loadProjects(): Promise<void> {
    const projects = await this.#repository.listProjects();
    this.#update({ projects: Object.freeze([...projects]) });
  }

  public async createProject(title = "Untitled Design"): Promise<void> {
    const generation = this.#beginNavigation();
    const document = createDocument({ projectId: this.#createId(), title });
    try {
      await this.#repository.createProject(document);
      if (!this.#isCurrentNavigation(generation)) return;
      const projects = await this.#repository.listProjects();
      if (!this.#isCurrentNavigation(generation)) return;
      this.#documents.set(document.projectId, document);
      this.#openDocument(document, projects);
    } finally {
      this.#finishNavigation(generation);
    }
  }

  public async openProject(projectId: string): Promise<void> {
    const generation = this.#beginNavigation();
    try {
      const loadedDocument = await this.#repository.loadProject(projectId);
      if (!this.#isCurrentNavigation(generation)) return;
      const cachedDocument = this.#documents.get(projectId);
      const document =
        cachedDocument &&
        cachedDocument.operationSequence >= loadedDocument.operationSequence
          ? cachedDocument
          : loadedDocument;
      this.#documents.set(projectId, document);
      this.#openDocument(document, this.#snapshot.projects);
    } finally {
      this.#finishNavigation(generation);
    }
  }

  public commitStroke(samples: readonly PenSample[]): Promise<void> {
    const startedAt = this.#performance.now();
    const document = this.#requireDocument();
    const operation: StrokeOperation = Object.freeze({
      type: "stroke.committed",
      operationId: this.#createId(),
      projectId: document.projectId,
      layerId: document.activeLayerId,
      sequence: document.operationSequence + 1,
      committedAt: this.#now(),
      brush: Object.freeze({ ...this.#brush }),
      samples: immutableSamples(samples),
    });
    const nextDocument = documentReducer(document, operation);
    this.#renderer?.commitStroke(toRenderStroke(operation));
    return this.#queueOperation(operation, nextDocument, startedAt);
  }

  public undoLastStroke(): Promise<void> {
    const startedAt = this.#performance.now();
    const document = this.#requireDocument();
    const target = [...document.strokes]
      .reverse()
      .find((stroke) => !document.hiddenStrokeIds.includes(stroke.operationId));
    if (!target) {
      return Promise.resolve();
    }

    const operation: StrokeVisibilityOperation = Object.freeze({
      type: "stroke.visibility-set",
      operationId: this.#createId(),
      projectId: document.projectId,
      sequence: document.operationSequence + 1,
      committedAt: this.#now(),
      targetOperationId: target.operationId,
      visible: false,
    });
    const nextDocument = documentReducer(document, operation);
    this.#renderer?.replaceDocument(toRenderDocument(nextDocument));
    this.#requestRender();
    return this.#queueOperation(operation, nextDocument, startedAt);
  }

  public async retrySave(): Promise<void> {
    const projectId = this.#snapshot.document?.projectId;
    if (!projectId) return;
    const existingWave = this.#retryWaves.get(projectId);
    if (existingWave) {
      await existingWave;
      return;
    }

    const failed = [...(this.#pendingWrites.get(projectId)?.values() ?? [])]
      .filter((entry) => entry.state === "error")
      .sort(
        (left, right) => left.operation.sequence - right.operation.sequence,
      );
    if (failed.length === 0) return;

    const wave = (async () => {
      for (const entry of failed) {
        entry.startedAt = this.#performance.now();
        await this.#startAttempt(entry);
      }
    })();
    this.#retryWaves.set(projectId, wave);
    try {
      await wave;
    } finally {
      if (this.#retryWaves.get(projectId) === wave) {
        this.#retryWaves.delete(projectId);
      }
    }
  }

  public async closeProject(): Promise<void> {
    const projectId = this.#snapshot.document?.projectId;
    if (!projectId) return;
    const writes = this.#projectWrites(projectId);
    if ([...writes].some((entry) => entry.state === "error")) return;

    const attempts = [...writes]
      .map((entry) => entry.attempt)
      .filter((attempt): attempt is Promise<void> => attempt !== null);
    if (attempts.length > 0) {
      if (!(await this.#confirmClose())) return;
      await Promise.all(attempts);
      if (this.#snapshot.document?.projectId !== projectId) return;
      if (this.#projectWrites(projectId).length > 0) return;
    }

    this.#navigationGeneration += 1;
    this.#snapshot = Object.freeze({
      ...this.#snapshot,
      view: "gallery",
      document: null,
      saveStatus: "saved",
      saveError: null,
      navigationBusy: false,
    });
    this.#emit();
    void this.loadProjects().catch(() => undefined);
  }

  public attachRenderer(
    renderer: Renderer,
    requestRender: () => void = () => undefined,
  ): () => void {
    this.#renderer = renderer;
    this.#requestRender = requestRender;
    if (this.#snapshot.document) {
      renderer.replaceDocument(toRenderDocument(this.#snapshot.document));
      requestRender();
    }
    return () => {
      if (this.#renderer === renderer) {
        this.#renderer = null;
        this.#requestRender = () => undefined;
      }
    };
  }

  #openDocument(
    document: DesignDocument,
    projects: readonly ProjectSummary[],
  ): void {
    this.#renderer?.replaceDocument(toRenderDocument(document));
    this.#requestRender();
    const saveState = this.#saveState(document.projectId);
    this.#snapshot = Object.freeze({
      view: "editor",
      projects: Object.freeze([...projects]),
      document,
      ...saveState,
      navigationBusy: false,
    });
    this.#emit();
  }

  #queueOperation(
    operation: DocumentOperation,
    document: DesignDocument,
    startedAt: number,
  ): Promise<void> {
    const entry: PendingWrite = {
      operation,
      state: "saving",
      startedAt,
      error: null,
      attempt: null,
    };
    this.#writesFor(operation.projectId).set(operation.operationId, entry);
    this.#documents.set(operation.projectId, document);
    this.#snapshot = Object.freeze({
      ...this.#snapshot,
      document,
      saveStatus: "saving",
      saveError: null,
    });
    this.#emit();
    return this.#startAttempt(entry);
  }

  #startAttempt(entry: PendingWrite): Promise<void> {
    if (entry.attempt) return entry.attempt;
    entry.state = "saving";
    entry.error = null;
    this.#publishSaveState();
    let persistence: Promise<void>;
    try {
      persistence = Promise.resolve(
        this.#repository.appendOperation(entry.operation),
      );
    } catch (error) {
      persistence = Promise.reject(error);
    }
    const attempt = persistence
      .then(() => {
        this.#measureDurability(entry.startedAt);
        const writes = this.#pendingWrites.get(entry.operation.projectId);
        writes?.delete(entry.operation.operationId);
        if (writes?.size === 0) {
          this.#pendingWrites.delete(entry.operation.projectId);
        }
      })
      .catch((error: unknown) => {
        this.#measureDurability(entry.startedAt);
        entry.state = "error";
        entry.error = errorMessage(error);
      })
      .finally(() => {
        entry.attempt = null;
        this.#publishSaveState();
      });
    entry.attempt = attempt;
    return attempt;
  }

  #measureDurability(startedAt: number): void {
    const duration = this.#performance.now() - startedAt;
    if (duration > DURABILITY_BUDGET_MS) {
      try {
        this.#performance.measure("stroke-durability", {
          start: startedAt,
          duration,
        });
      } catch {
        // Diagnostics must never change the result of a durable append.
      }
    }
  }

  #publishSaveState(): void {
    const projectId = this.#snapshot.document?.projectId;
    const saveState = projectId
      ? this.#saveState(projectId)
      : { saveStatus: "saved" as const, saveError: null };
    this.#snapshot = Object.freeze({
      ...this.#snapshot,
      ...saveState,
    });
    this.#emit();
  }

  #requireDocument(): DesignDocument {
    if (!this.#snapshot.document) {
      throw new Error("No project is open.");
    }
    return this.#snapshot.document;
  }

  #update(update: Partial<EditorSnapshot>): void {
    this.#snapshot = Object.freeze({ ...this.#snapshot, ...update });
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }

  #beginNavigation(): number {
    const generation = ++this.#navigationGeneration;
    this.#update({ navigationBusy: true });
    return generation;
  }

  #finishNavigation(generation: number): void {
    if (!this.#isCurrentNavigation(generation)) return;
    if (this.#snapshot.navigationBusy) {
      this.#update({ navigationBusy: false });
    }
  }

  #isCurrentNavigation(generation: number): boolean {
    return this.#navigationGeneration === generation;
  }

  #writesFor(projectId: string): Map<string, PendingWrite> {
    const existing = this.#pendingWrites.get(projectId);
    if (existing) return existing;
    const writes = new Map<string, PendingWrite>();
    this.#pendingWrites.set(projectId, writes);
    return writes;
  }

  #projectWrites(projectId: string): readonly PendingWrite[] {
    return [...(this.#pendingWrites.get(projectId)?.values() ?? [])];
  }

  #saveState(
    projectId: string,
  ): Pick<EditorSnapshot, "saveStatus" | "saveError"> {
    const writes = this.#projectWrites(projectId);
    const failed = writes.find((entry) => entry.state === "error");
    if (failed) {
      return { saveStatus: "error", saveError: failed.error };
    }
    if (writes.length > 0) {
      return { saveStatus: "saving", saveError: null };
    }
    return { saveStatus: "saved", saveError: null };
  }
}

export function createEditorStore(options: EditorStoreOptions): EditorStore {
  return new EditorStore(options);
}

export function toRenderStroke(operation: StrokeOperation): RenderStroke {
  return Object.freeze({
    operationId: operation.operationId,
    mesh: buildStrokeMesh(operation.samples, operation.brush),
    color: hexColor(operation.brush.color),
  });
}

function toRenderDocument(document: DesignDocument): readonly RenderStroke[] {
  return document.strokes
    .filter((stroke) => !document.hiddenStrokeIds.includes(stroke.operationId))
    .map(toRenderStroke);
}

function hexColor(color: `#${string}`): readonly [number, number, number, 1] {
  const red = Number.parseInt(color.slice(1, 3), 16) / 255;
  const green = Number.parseInt(color.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(color.slice(5, 7), 16) / 255;
  return [red, green, blue, 1];
}

function immutableSamples(samples: readonly PenSample[]): readonly PenSample[] {
  return Object.freeze(samples.map((sample) => Object.freeze({ ...sample })));
}

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}

function defaultPerformance(): EditorPerformance {
  return {
    now: () => globalThis.performance.now(),
    measure: (name, options) => {
      globalThis.performance.measure(name, options);
    },
  };
}

function defaultConfirmClose(): boolean {
  return globalThis.confirm(
    "This design is still saving. Close it before the save finishes?",
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
