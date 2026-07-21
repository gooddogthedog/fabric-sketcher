import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  DocumentSequenceError,
  documentReducer,
} from "../../domain/document/documentReducer";
import type {
  DesignDocument,
  DocumentOperation,
} from "../../domain/document/types";
import type {
  AtomicSnapshotFileStore,
  ProjectRepository,
  ProjectSummary,
  SnapshotCodec,
} from "./types";
import {
  decodeDocumentSnapshot,
  encodeDocumentSnapshot,
  PersistenceError,
} from "./types";
import { ProjectWriteQueue } from "./writeQueue";

export type BrowserStorageMode = "opfs" | "indexeddb-degraded";

type BrowserProjectRecord = ProjectSummary &
  Readonly<{
    initialDocument: DesignDocument;
    latestSequence: number;
  }>;

type SnapshotIndexRecord = Readonly<{
  projectId: string;
  generation: number;
  operationSequence: number;
  location: "opfs" | "indexeddb";
  path?: string;
  encoding?: "gzip-json-v1";
  payload?: Uint8Array;
}>;

type SettingRecord = Readonly<{
  name: string;
  value: string;
}>;

interface ProjectDatabase extends DBSchema {
  projects: {
    key: string;
    value: BrowserProjectRecord;
  };
  operations: {
    key: [string, number];
    value: DocumentOperation;
    indexes: {
      operationId: string;
      projectId: string;
    };
  };
  snapshotIndex: {
    key: [string, number];
    value: SnapshotIndexRecord;
    indexes: {
      projectId: string;
    };
  };
  settings: {
    key: string;
    value: SettingRecord;
  };
}

export type BrowserProjectRepositoryOptions = Readonly<{
  databaseName?: string;
  now?: () => string;
  snapshotFiles?: AtomicSnapshotFileStore | null;
  snapshotCodec?: SnapshotCodec;
  beforeAppend?: (operation: DocumentOperation) => void | Promise<void>;
  afterAppendStaged?: (operation: DocumentOperation) => void;
  afterSnapshotFileWritten?: (
    document: DesignDocument,
    generation: number,
  ) => void;
}>;

function snapshotPath(projectId: string, generation: number): string {
  return `projects/${projectId}/snapshots/${generation}.json`;
}

export class SnapshotCompressionUnavailableError extends Error {
  constructor(capability: "compression" | "decompression") {
    super(`Browser gzip ${capability} is unavailable.`);
    this.name = "SnapshotCompressionUnavailableError";
  }
}

async function readTransformedBytes(
  source: Uint8Array,
  transform: Readonly<{
    writable: WritableStream<BufferSource>;
    readable: ReadableStream<Uint8Array<ArrayBuffer>>;
  }>,
): Promise<Uint8Array> {
  const input = new ArrayBuffer(source.byteLength);
  new Uint8Array(input).set(source);
  const reader = transform.readable.getReader();
  const contentsPromise = (async () => {
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
      byteLength += value.byteLength;
    }
    const contents = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      contents.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return contents;
  })();
  const writer = transform.writable.getWriter();
  await writer.write(input);
  await writer.close();
  return contentsPromise;
}

export class GzipSnapshotCodec implements SnapshotCodec {
  readonly encoding = "gzip-json-v1";

  async compress(json: string): Promise<Uint8Array> {
    if (typeof CompressionStream === "undefined") {
      throw new SnapshotCompressionUnavailableError("compression");
    }
    return readTransformedBytes(
      new TextEncoder().encode(json),
      new CompressionStream("gzip"),
    );
  }

  async decompress(payload: Uint8Array): Promise<string> {
    if (typeof DecompressionStream === "undefined") {
      throw new SnapshotCompressionUnavailableError("decompression");
    }
    const decompressed = await readTransformedBytes(
      payload,
      new DecompressionStream("gzip"),
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(decompressed);
  }
}

export class BrowserProjectRepository implements ProjectRepository {
  readonly #database: Promise<IDBPDatabase<ProjectDatabase>>;
  readonly #now: () => string;
  readonly #snapshotFiles: AtomicSnapshotFileStore | null;
  readonly #beforeAppend: (
    operation: DocumentOperation,
  ) => void | Promise<void>;
  readonly #afterAppendStaged: (operation: DocumentOperation) => void;
  readonly #afterSnapshotFileWritten: (
    document: DesignDocument,
    generation: number,
  ) => void;
  readonly #snapshotCodec: SnapshotCodec;
  readonly #writes = new ProjectWriteQueue();

  readonly storageMode: BrowserStorageMode;

  constructor(options: BrowserProjectRepositoryOptions = {}) {
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#snapshotFiles = options.snapshotFiles ?? null;
    this.#beforeAppend = options.beforeAppend ?? (() => undefined);
    this.#afterAppendStaged = options.afterAppendStaged ?? (() => undefined);
    this.#afterSnapshotFileWritten =
      options.afterSnapshotFileWritten ?? (() => undefined);
    this.#snapshotCodec = options.snapshotCodec ?? new GzipSnapshotCodec();
    this.storageMode = this.#snapshotFiles ? "opfs" : "indexeddb-degraded";
    this.#database = openDB<ProjectDatabase>(
      options.databaseName ?? "fabric-sketcher",
      1,
      {
        upgrade(database) {
          database.createObjectStore("projects", { keyPath: "projectId" });
          const operations = database.createObjectStore("operations", {
            keyPath: ["projectId", "sequence"],
          });
          operations.createIndex("operationId", "operationId", {
            unique: true,
          });
          operations.createIndex("projectId", "projectId");
          const snapshots = database.createObjectStore("snapshotIndex", {
            keyPath: ["projectId", "generation"],
          });
          snapshots.createIndex("projectId", "projectId");
          database.createObjectStore("settings", { keyPath: "name" });
        },
      },
    );
  }

  async listProjects(): Promise<readonly ProjectSummary[]> {
    const database = await this.#database;
    return (await database.getAll("projects"))
      .map((project) => ({
        projectId: project.projectId,
        title: project.title,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        width: project.width,
        height: project.height,
      }))
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.projectId.localeCompare(right.projectId),
      );
  }

  async createProject(document: DesignDocument): Promise<void> {
    const timestamp = this.#now();
    const database = await this.#database;
    await database.add("projects", {
      projectId: document.projectId,
      title: document.title,
      createdAt: timestamp,
      updatedAt: timestamp,
      width: document.width,
      height: document.height,
      initialDocument: structuredClone(document),
      latestSequence: document.operationSequence,
    });
  }

  async loadProject(projectId: string): Promise<DesignDocument> {
    const database = await this.#database;
    const record = await database.get("projects", projectId);
    if (!record) {
      throw new Error(`Project ${projectId} does not exist.`);
    }
    const [operations, snapshots] = await Promise.all([
      database.getAllFromIndex("operations", "projectId", projectId),
      database.getAllFromIndex("snapshotIndex", "projectId", projectId),
    ]);
    const orderedOperations = operations.sort(
      (left, right) => left.sequence - right.sequence,
    );

    for (const snapshot of snapshots.sort(
      (left, right) => right.generation - left.generation,
    )) {
      try {
        let base: DesignDocument;
        if (
          snapshot.location === "opfs" &&
          snapshot.path &&
          this.#snapshotFiles
        ) {
          base = decodeDocumentSnapshot(
            await this.#snapshotFiles.read(snapshot.path),
            projectId,
          );
        } else if (
          snapshot.location === "indexeddb" &&
          snapshot.encoding === this.#snapshotCodec.encoding &&
          snapshot.payload
        ) {
          base = decodeDocumentSnapshot(
            new TextEncoder().encode(
              await this.#snapshotCodec.decompress(snapshot.payload),
            ),
            projectId,
          );
        } else {
          continue;
        }
        if (
          base.operationSequence !== snapshot.operationSequence ||
          base.operationSequence > record.latestSequence
        ) {
          throw new Error(
            `Invalid snapshot sequence for project ${projectId}.`,
          );
        }
        return orderedOperations
          .filter((operation) => operation.sequence > base.operationSequence)
          .reduce(documentReducer, base);
      } catch {
        // The next confirmed generation is the recovery candidate.
      }
    }

    return orderedOperations
      .filter(
        (operation) =>
          operation.sequence > record.initialDocument.operationSequence,
      )
      .reduce(documentReducer, structuredClone(record.initialDocument));
  }

  async appendOperation(operation: DocumentOperation): Promise<void> {
    const durableOperation = structuredClone(operation);
    return this.#writes.run(durableOperation.projectId, async () => {
      try {
        await this.#beforeAppend(durableOperation);
      } catch (cause) {
        throw new PersistenceError(
          `Could not persist operation ${durableOperation.operationId}.`,
          { cause },
        );
      }

      const database = await this.#database;
      const transaction = database.transaction(
        ["projects", "operations"],
        "readwrite",
      );
      try {
        const operations = transaction.objectStore("operations");
        const duplicate = await operations
          .index("operationId")
          .get(durableOperation.operationId);
        if (duplicate) {
          await transaction.done;
          return;
        }

        const projects = transaction.objectStore("projects");
        const project = await projects.get(durableOperation.projectId);
        if (!project) {
          throw new Error(
            `Project ${durableOperation.projectId} does not exist.`,
          );
        }
        const expectedSequence = project.latestSequence + 1;
        if (durableOperation.sequence !== expectedSequence) {
          throw new DocumentSequenceError(
            expectedSequence,
            durableOperation.sequence,
          );
        }

        await operations.add(durableOperation);
        await projects.put({
          ...project,
          latestSequence: durableOperation.sequence,
          updatedAt: this.#now(),
        });
        this.#afterAppendStaged(durableOperation);
        await transaction.done;
      } catch (cause) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have aborted itself.
        }
        await transaction.done.catch(() => undefined);
        if (cause instanceof DocumentSequenceError) {
          throw cause;
        }
        throw new PersistenceError(
          `Could not persist operation ${durableOperation.operationId}.`,
          { cause },
        );
      }
    });
  }

  async writeSnapshot(document: DesignDocument): Promise<void> {
    const durableDocument = structuredClone(document);
    return this.#writes.run(durableDocument.projectId, async () => {
      const database = await this.#database;
      const existing = await database.getAllFromIndex(
        "snapshotIndex",
        "projectId",
        durableDocument.projectId,
      );
      const generation =
        existing.reduce(
          (latest, snapshot) => Math.max(latest, snapshot.generation),
          0,
        ) + 1;
      const path = snapshotPath(durableDocument.projectId, generation);
      let nextSnapshot: SnapshotIndexRecord;
      if (this.#snapshotFiles) {
        try {
          await this.#snapshotFiles.writeAtomically(
            path,
            encodeDocumentSnapshot(durableDocument),
          );
          this.#afterSnapshotFileWritten(durableDocument, generation);
        } catch (cause) {
          await this.#snapshotFiles.delete(path).catch(() => undefined);
          throw new PersistenceError(
            `Could not write snapshot ${generation} for project ${durableDocument.projectId}.`,
            { cause },
          );
        }
        nextSnapshot = {
          projectId: durableDocument.projectId,
          generation,
          operationSequence: durableDocument.operationSequence,
          location: "opfs",
          path,
        };
      } else {
        try {
          nextSnapshot = {
            projectId: durableDocument.projectId,
            generation,
            operationSequence: durableDocument.operationSequence,
            location: "indexeddb",
            encoding: this.#snapshotCodec.encoding,
            payload: await this.#snapshotCodec.compress(
              JSON.stringify(durableDocument),
            ),
          };
        } catch (cause) {
          throw new PersistenceError(
            `Could not compress snapshot ${generation} for project ${durableDocument.projectId}.`,
            { cause },
          );
        }
      }

      const retained: SnapshotIndexRecord[] = [...existing, nextSnapshot].sort(
        (left, right) => right.generation - left.generation,
      );
      const expired = retained.slice(2);
      const transaction = database.transaction(
        ["projects", "snapshotIndex", "settings"],
        "readwrite",
      );
      try {
        const projects = transaction.objectStore("projects");
        const project = await projects.get(durableDocument.projectId);
        if (!project) {
          throw new Error(
            `Project ${durableDocument.projectId} does not exist.`,
          );
        }
        if (durableDocument.operationSequence > project.latestSequence) {
          throw new Error(
            `Snapshot sequence ${durableDocument.operationSequence} exceeds durable sequence ${project.latestSequence}.`,
          );
        }

        const snapshotIndex = transaction.objectStore("snapshotIndex");
        await snapshotIndex.add(retained[0]);
        await Promise.all(
          expired.map((snapshot) =>
            snapshotIndex.delete([snapshot.projectId, snapshot.generation]),
          ),
        );
        await projects.put({
          ...project,
          title: durableDocument.title,
          updatedAt: this.#now(),
          width: durableDocument.width,
          height: durableDocument.height,
        });
        await transaction.objectStore("settings").put({
          name: "storageMode",
          value: this.storageMode,
        });
        await transaction.done;
      } catch (cause) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have aborted itself.
        }
        await transaction.done.catch(() => undefined);
        if (nextSnapshot.location === "opfs" && this.#snapshotFiles) {
          await this.#snapshotFiles.delete(path).catch(() => undefined);
        }
        throw new PersistenceError(
          `Could not confirm snapshot ${generation} for project ${durableDocument.projectId}.`,
          { cause },
        );
      }

      if (this.#snapshotFiles) {
        await Promise.all(
          expired
            .filter((snapshot) => snapshot.location === "opfs" && snapshot.path)
            .map((snapshot) =>
              this.#snapshotFiles!.delete(snapshot.path!).catch(
                () => undefined,
              ),
            ),
        );
      }
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    return this.#writes.run(projectId, async () => {
      const database = await this.#database;
      const transaction = database.transaction(
        ["projects", "operations", "snapshotIndex"],
        "readwrite",
      );
      try {
        const operations = transaction.objectStore("operations");
        const operationKeys = await operations
          .index("projectId")
          .getAllKeys(projectId);
        await Promise.all(operationKeys.map((key) => operations.delete(key)));

        const snapshots = transaction.objectStore("snapshotIndex");
        const snapshotRecords = await snapshots
          .index("projectId")
          .getAll(projectId);
        await Promise.all(
          snapshotRecords.map((snapshot) =>
            snapshots.delete([snapshot.projectId, snapshot.generation]),
          ),
        );
        await transaction.objectStore("projects").delete(projectId);
        await transaction.done;

        if (this.#snapshotFiles) {
          await Promise.all(
            snapshotRecords
              .filter(
                (snapshot) => snapshot.location === "opfs" && snapshot.path,
              )
              .map((snapshot) =>
                this.#snapshotFiles!.delete(snapshot.path!).catch(
                  () => undefined,
                ),
              ),
          );
        }
      } catch (cause) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have aborted itself.
        }
        await transaction.done.catch(() => undefined);
        throw new PersistenceError(`Could not delete project ${projectId}.`, {
          cause,
        });
      }
    });
  }

  async close(): Promise<void> {
    const database = await this.#database;
    database.close();
  }
}
