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
  DocumentOperationValidationError,
  encodeDocumentSnapshot,
  normalizeDocumentOperation,
  normalizeDesignDocument,
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
  environment?: BrowserPersistenceEnvironment;
  beforeAppend?: (operation: DocumentOperation) => void | Promise<void>;
  afterAppendStaged?: (operation: DocumentOperation) => void;
  afterSnapshotFileWritten?: (
    document: DesignDocument,
    generation: number,
  ) => void;
}>;

function snapshotPath(projectId: string, generation: number): string {
  const projectSegment = encodeURIComponent(projectId).replaceAll(".", "%2E");
  return `projects/${projectSegment}/snapshots/${generation}.json`;
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

export type OpfsWritableFileLike = Readonly<{
  write(contents: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}>;

export type OpfsFileHandleLike = Readonly<{
  createWritable(options?: {
    keepExistingData?: boolean;
  }): Promise<OpfsWritableFileLike>;
  getFile(): Promise<Readonly<{ arrayBuffer(): Promise<ArrayBuffer> }>>;
}>;

export type OpfsDirectoryHandleLike = Readonly<{
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<OpfsDirectoryHandleLike>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<OpfsFileHandleLike>;
  removeEntry(name: string): Promise<void>;
}>;

export type OpfsRootProvider = () => Promise<OpfsDirectoryHandleLike>;

export class OpfsUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      `Origin private file system is unavailable${cause instanceof Error ? `: ${cause.message}` : "."}`,
      { cause },
    );
    this.name = "OpfsUnavailableError";
  }
}

function asOpfsUnavailableError(cause: unknown): OpfsUnavailableError {
  return cause instanceof OpfsUnavailableError
    ? cause
    : new OpfsUnavailableError(cause);
}

export type BrowserPersistenceEnvironment = Readonly<{
  storage?: Readonly<{
    getDirectory?: OpfsRootProvider;
  }>;
}>;

function defaultBrowserPersistenceEnvironment(): BrowserPersistenceEnvironment {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.storage?.getDirectory !== "function"
  ) {
    return {};
  }
  const storage = navigator.storage;
  return {
    storage: {
      getDirectory: () =>
        storage.getDirectory() as Promise<OpfsDirectoryHandleLike>,
    },
  };
}

function safeOpfsPathSegments(path: string): readonly string[] {
  const segments = path.split("/");
  if (
    path.startsWith("/") ||
    segments.length < 2 ||
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        segment.includes("\\") ||
        segment.includes("\0"),
    )
  ) {
    throw new Error(`Unsafe OPFS snapshot path ${path}.`);
  }
  return segments;
}

export class NavigatorOpfsSnapshotFileStore implements AtomicSnapshotFileStore {
  readonly #getRoot: OpfsRootProvider;

  constructor(getRoot: OpfsRootProvider) {
    this.#getRoot = getRoot;
  }

  async #root(): Promise<OpfsDirectoryHandleLike> {
    try {
      return await this.#getRoot();
    } catch (cause) {
      throw new OpfsUnavailableError(cause);
    }
  }

  async writeAtomically(path: string, contents: Uint8Array): Promise<void> {
    const segments = [...safeOpfsPathSegments(path)];
    const fileName = segments.pop()!;
    try {
      let directory = await this.#root();
      for (const segment of segments) {
        directory = await directory.getDirectoryHandle(segment, {
          create: true,
        });
      }
      const file = await directory.getFileHandle(fileName, { create: true });
      const writer = await file.createWritable({ keepExistingData: false });
      try {
        await writer.write(contents.slice());
        await writer.close();
      } catch (cause) {
        await writer.abort?.().catch(() => undefined);
        throw cause;
      }
    } catch (cause) {
      throw asOpfsUnavailableError(cause);
    }
  }

  async read(path: string): Promise<Uint8Array> {
    const segments = [...safeOpfsPathSegments(path)];
    const fileName = segments.pop()!;
    try {
      let directory = await this.#root();
      for (const segment of segments) {
        directory = await directory.getDirectoryHandle(segment);
      }
      const file = await directory.getFileHandle(fileName);
      return new Uint8Array(await (await file.getFile()).arrayBuffer());
    } catch (cause) {
      throw asOpfsUnavailableError(cause);
    }
  }

  async delete(path: string): Promise<void> {
    const segments = [...safeOpfsPathSegments(path)];
    const fileName = segments.pop()!;
    try {
      let directory = await this.#root();
      for (const segment of segments) {
        directory = await directory.getDirectoryHandle(segment);
      }
      await directory.removeEntry(fileName);
    } catch (cause) {
      throw asOpfsUnavailableError(cause);
    }
  }
}

export class BrowserProjectRepository implements ProjectRepository {
  readonly #database: Promise<IDBPDatabase<ProjectDatabase>>;
  readonly #now: () => string;
  #snapshotFiles: AtomicSnapshotFileStore | null;
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
  #storageMode: BrowserStorageMode;

  get storageMode(): BrowserStorageMode {
    return this.#storageMode;
  }

  constructor(options: BrowserProjectRepositoryOptions = {}) {
    this.#now = options.now ?? (() => new Date().toISOString());
    const environment =
      options.environment ?? defaultBrowserPersistenceEnvironment();
    this.#snapshotFiles =
      options.snapshotFiles === undefined
        ? environment.storage?.getDirectory
          ? new NavigatorOpfsSnapshotFileStore(environment.storage.getDirectory)
          : null
        : options.snapshotFiles;
    this.#beforeAppend = options.beforeAppend ?? (() => undefined);
    this.#afterAppendStaged = options.afterAppendStaged ?? (() => undefined);
    this.#afterSnapshotFileWritten =
      options.afterSnapshotFileWritten ?? (() => undefined);
    this.#snapshotCodec = options.snapshotCodec ?? new GzipSnapshotCodec();
    this.#storageMode = this.#snapshotFiles ? "opfs" : "indexeddb-degraded";
    const restorePersistedMode = options.snapshotFiles === undefined;
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
    ).then(async (database) => {
      const setting = await database.get("settings", "storageMode");
      if (restorePersistedMode && setting?.value === "indexeddb-degraded") {
        this.#enterDegradedMode();
      }
      return database;
    });
  }

  #enterDegradedMode(): void {
    this.#snapshotFiles = null;
    this.#storageMode = "indexeddb-degraded";
  }

  async #persistDegradedMode(
    database: IDBPDatabase<ProjectDatabase>,
  ): Promise<void> {
    this.#enterDegradedMode();
    await database.put("settings", {
      name: "storageMode",
      value: "indexeddb-degraded",
    });
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
    const orderedOperations = operations
      .map(normalizeDocumentOperation)
      .sort((left, right) => left.sequence - right.sequence);

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
      } catch (cause) {
        if (cause instanceof OpfsUnavailableError) {
          await this.#persistDegradedMode(database);
        }
        // The next confirmed generation is the recovery candidate.
      }
    }

    const initialDocument = normalizeDesignDocument(
      record.initialDocument,
      projectId,
    );
    return orderedOperations
      .filter(
        (operation) => operation.sequence > initialDocument.operationSequence,
      )
      .reduce(documentReducer, initialDocument);
  }

  async appendOperation(operation: DocumentOperation): Promise<void> {
    const stagedOperation = structuredClone(operation);
    return this.#writes.run(stagedOperation.projectId, async () => {
      try {
        await this.#beforeAppend(stagedOperation);
      } catch (cause) {
        throw new PersistenceError(
          `Could not persist operation ${stagedOperation.operationId}.`,
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
          .get(stagedOperation.operationId);
        if (duplicate) {
          await transaction.done;
          return;
        }

        const durableOperation = normalizeDocumentOperation(stagedOperation);

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
        if (
          cause instanceof DocumentSequenceError ||
          cause instanceof DocumentOperationValidationError
        ) {
          throw cause;
        }
        throw new PersistenceError(
          `Could not persist operation ${stagedOperation.operationId}.`,
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
        const snapshotFiles = this.#snapshotFiles;
        try {
          await snapshotFiles.writeAtomically(
            path,
            encodeDocumentSnapshot(durableDocument),
          );
          this.#afterSnapshotFileWritten(durableDocument, generation);
        } catch (cause) {
          await snapshotFiles.delete(path).catch(() => undefined);
          if (!(cause instanceof OpfsUnavailableError)) {
            throw new PersistenceError(
              `Could not write snapshot ${generation} for project ${durableDocument.projectId}.`,
              { cause },
            );
          }
          this.#enterDegradedMode();
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
          } catch (fallbackCause) {
            throw new PersistenceError(
              `Could not compress snapshot ${generation} for project ${durableDocument.projectId}.`,
              { cause: fallbackCause },
            );
          }
          // The IndexedDB confirmation transaction below persists degradation.
          return await this.#confirmSnapshot(
            database,
            durableDocument,
            existing,
            nextSnapshot,
            generation,
            path,
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

      return this.#confirmSnapshot(
        database,
        durableDocument,
        existing,
        nextSnapshot,
        generation,
        path,
      );
    });
  }

  async #confirmSnapshot(
    database: IDBPDatabase<ProjectDatabase>,
    durableDocument: DesignDocument,
    existing: readonly SnapshotIndexRecord[],
    nextSnapshot: SnapshotIndexRecord,
    generation: number,
    path: string,
  ): Promise<void> {
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
        throw new Error(`Project ${durableDocument.projectId} does not exist.`);
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
            this.#snapshotFiles!.delete(snapshot.path!).catch(() => undefined),
          ),
      );
    }
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
