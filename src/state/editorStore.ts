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
  readonly #pendingWrites = new Map<string, PendingWrite>();
  #renderer: Renderer | null;
  #snapshot: EditorSnapshot = Object.freeze({
    view: "gallery",
    projects: Object.freeze([] as ProjectSummary[]),
    document: null,
    saveStatus: "saved",
    saveError: null,
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
    const document = createDocument({ projectId: this.#createId(), title });
    await this.#repository.createProject(document);
    const projects = await this.#repository.listProjects();
    this.#openDocument(document, projects);
  }

  public async openProject(projectId: string): Promise<void> {
    const document = await this.#repository.loadProject(projectId);
    this.#openDocument(document, this.#snapshot.projects);
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
    return this.#queueOperation(operation, nextDocument, startedAt);
  }

  public async retrySave(): Promise<void> {
    const failed = [...this.#pendingWrites.values()]
      .filter((entry) => entry.state === "error")
      .sort(
        (left, right) => left.operation.sequence - right.operation.sequence,
      );

    for (const entry of failed) {
      entry.state = "saving";
      entry.startedAt = this.#performance.now();
      this.#publishSaveState();
      await this.#persist(entry);
    }
  }

  public async closeProject(): Promise<void> {
    if (
      this.#snapshot.saveStatus === "saving" &&
      !(await this.#confirmClose())
    ) {
      return;
    }

    this.#snapshot = Object.freeze({
      ...this.#snapshot,
      view: "gallery",
      document: null,
    });
    this.#emit();
    void this.loadProjects().catch(() => undefined);
  }

  public attachRenderer(renderer: Renderer): () => void {
    this.#renderer = renderer;
    if (this.#snapshot.document) {
      renderer.replaceDocument(toRenderDocument(this.#snapshot.document));
    }
    return () => {
      if (this.#renderer === renderer) {
        this.#renderer = null;
      }
    };
  }

  #openDocument(
    document: DesignDocument,
    projects: readonly ProjectSummary[],
  ): void {
    this.#renderer?.replaceDocument(toRenderDocument(document));
    this.#snapshot = Object.freeze({
      view: "editor",
      projects: Object.freeze([...projects]),
      document,
      saveStatus: "saved",
      saveError: null,
    });
    this.#emit();
  }

  #queueOperation(
    operation: DocumentOperation,
    document: DesignDocument,
    startedAt: number,
  ): Promise<void> {
    const entry: PendingWrite = { operation, state: "saving", startedAt };
    this.#pendingWrites.set(operation.operationId, entry);
    this.#snapshot = Object.freeze({
      ...this.#snapshot,
      document,
      saveStatus: "saving",
      saveError: null,
    });
    this.#emit();
    return this.#persist(entry);
  }

  async #persist(entry: PendingWrite): Promise<void> {
    try {
      await this.#repository.appendOperation(entry.operation);
      this.#measureDurability(entry.startedAt);
      this.#pendingWrites.delete(entry.operation.operationId);
    } catch (error) {
      this.#measureDurability(entry.startedAt);
      entry.state = "error";
      this.#snapshot = Object.freeze({
        ...this.#snapshot,
        saveError: errorMessage(error),
      });
    }
    this.#publishSaveState();
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
    const pending = [...this.#pendingWrites.values()];
    const saveStatus: EditorSaveStatus = pending.some(
      (entry) => entry.state === "error",
    )
      ? "error"
      : pending.length > 0
        ? "saving"
        : "saved";
    this.#snapshot = Object.freeze({
      ...this.#snapshot,
      saveStatus,
      saveError: saveStatus === "error" ? this.#snapshot.saveError : null,
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
