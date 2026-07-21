import type {
  DesignDocument,
  DocumentOperation,
} from "../../domain/document/types";
import { documentReducer } from "../../domain/document/documentReducer";
import type {
  AtomicSnapshotFileStore,
  ProjectRepository,
  ProjectSummary,
} from "./types";
import {
  decodeDocumentSnapshot,
  encodeDocumentSnapshot,
  PersistenceError,
} from "./types";
import { ProjectWriteQueue } from "./writeQueue";

type SnapshotIndexEntry = Readonly<{
  generation: number;
  path: string;
}>;

type MemoryProjectRecord = {
  summary: ProjectSummary;
  initialDocument: DesignDocument;
  operations: DocumentOperation[];
  snapshots: SnapshotIndexEntry[];
};

export type MemoryProjectRepositoryOptions = Readonly<{
  now?: () => string;
  snapshotFiles?: AtomicSnapshotFileStore;
  beforeAppend?: (operation: DocumentOperation) => void | Promise<void>;
}>;

class MemorySnapshotFileStore implements AtomicSnapshotFileStore {
  readonly #files = new Map<string, Uint8Array>();

  async writeAtomically(path: string, contents: Uint8Array): Promise<void> {
    this.#files.set(path, contents.slice());
  }

  async read(path: string): Promise<Uint8Array> {
    const contents = this.#files.get(path);
    if (!contents) {
      throw new Error(`Snapshot file ${path} does not exist.`);
    }
    return contents.slice();
  }

  async delete(path: string): Promise<void> {
    this.#files.delete(path);
  }
}

function snapshotPath(projectId: string, generation: number): string {
  return `projects/${projectId}/snapshots/${generation}.json`;
}

export class MemoryProjectRepository implements ProjectRepository {
  readonly #now: () => string;
  readonly #projects = new Map<string, MemoryProjectRecord>();
  readonly #snapshotFiles: AtomicSnapshotFileStore;
  readonly #beforeAppend: (
    operation: DocumentOperation,
  ) => void | Promise<void>;
  readonly #writes = new ProjectWriteQueue();

  constructor(options: MemoryProjectRepositoryOptions = {}) {
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#snapshotFiles =
      options.snapshotFiles ?? new MemorySnapshotFileStore();
    this.#beforeAppend = options.beforeAppend ?? (() => undefined);
  }

  async listProjects(): Promise<readonly ProjectSummary[]> {
    return [...this.#projects.values()]
      .map(({ summary }) => structuredClone(summary))
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.projectId.localeCompare(right.projectId),
      );
  }

  async createProject(document: DesignDocument): Promise<void> {
    const timestamp = this.#now();
    this.#projects.set(document.projectId, {
      summary: {
        projectId: document.projectId,
        title: document.title,
        createdAt: timestamp,
        updatedAt: timestamp,
        width: document.width,
        height: document.height,
      },
      initialDocument: structuredClone(document),
      operations: [],
      snapshots: [],
    });
  }

  async loadProject(projectId: string): Promise<DesignDocument> {
    const record = this.#projects.get(projectId);
    if (!record) {
      throw new Error(`Project ${projectId} does not exist.`);
    }
    let base = structuredClone(record.initialDocument);
    for (const snapshot of [...record.snapshots].reverse()) {
      try {
        base = decodeDocumentSnapshot(
          await this.#snapshotFiles.read(snapshot.path),
          projectId,
        );
        break;
      } catch {
        // A prior confirmed generation remains a valid recovery candidate.
      }
    }
    return record.operations
      .filter((operation) => operation.sequence > base.operationSequence)
      .reduce(documentReducer, base);
  }

  async appendOperation(operation: DocumentOperation): Promise<void> {
    const durableOperation = structuredClone(operation);
    return this.#writes.run(operation.projectId, async () => {
      try {
        await this.#beforeAppend(durableOperation);
      } catch (cause) {
        throw new PersistenceError(
          `Could not persist operation ${durableOperation.operationId}.`,
          { cause },
        );
      }
      const record = this.#projects.get(durableOperation.projectId);
      if (!record) {
        throw new Error(
          `Project ${durableOperation.projectId} does not exist.`,
        );
      }
      if (
        [...this.#projects.values()].some((project) =>
          project.operations.some(
            (existing) => existing.operationId === durableOperation.operationId,
          ),
        )
      ) {
        return;
      }

      documentReducer(
        record.operations.reduce(
          documentReducer,
          structuredClone(record.initialDocument),
        ),
        durableOperation,
      );
      record.operations.push(durableOperation);
      record.summary = { ...record.summary, updatedAt: this.#now() };
    });
  }

  async writeSnapshot(document: DesignDocument): Promise<void> {
    const durableDocument = structuredClone(document);
    return this.#writes.run(durableDocument.projectId, async () => {
      const record = this.#projects.get(durableDocument.projectId);
      if (!record) {
        throw new Error(`Project ${durableDocument.projectId} does not exist.`);
      }
      const latestSequence =
        record.operations.at(-1)?.sequence ??
        record.initialDocument.operationSequence;
      if (durableDocument.operationSequence > latestSequence) {
        const cause = new Error(
          `Snapshot sequence ${durableDocument.operationSequence} exceeds durable sequence ${latestSequence}.`,
        );
        throw new PersistenceError(
          `Could not confirm a snapshot for project ${durableDocument.projectId}.`,
          { cause },
        );
      }
      const generation = (record.snapshots.at(-1)?.generation ?? 0) + 1;
      const path = snapshotPath(durableDocument.projectId, generation);
      try {
        await this.#snapshotFiles.writeAtomically(
          path,
          encodeDocumentSnapshot(durableDocument),
        );
      } catch (cause) {
        throw new PersistenceError(
          `Could not write snapshot ${generation} for project ${durableDocument.projectId}.`,
          { cause },
        );
      }
      record.snapshots.push({ generation, path });
      const expired = record.snapshots.splice(
        0,
        Math.max(0, record.snapshots.length - 2),
      );
      await Promise.all(
        expired.map((snapshot) => this.#snapshotFiles.delete(snapshot.path)),
      );
      record.summary = {
        ...record.summary,
        title: durableDocument.title,
        updatedAt: this.#now(),
        width: durableDocument.width,
        height: durableDocument.height,
      };
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    return this.#writes.run(projectId, async () => {
      const record = this.#projects.get(projectId);
      if (!record) {
        return;
      }
      await Promise.all(
        record.snapshots.map((snapshot) =>
          this.#snapshotFiles.delete(snapshot.path),
        ),
      );
      this.#projects.delete(projectId);
    });
  }
}
