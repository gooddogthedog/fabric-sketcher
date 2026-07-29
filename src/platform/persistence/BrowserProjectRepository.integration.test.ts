import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createDocument } from "../../domain/document/createDocument";
import { documentReducer } from "../../domain/document/documentReducer";
import {
  describeProjectRepositoryContract,
  foundation,
  stroke,
  visibility,
} from "./ProjectRepository.contract";
import { MemoryProjectRepository } from "./MemoryProjectRepository";
import {
  BrowserProjectRepository,
  GzipSnapshotCodec,
  NavigatorOpfsSnapshotFileStore,
} from "./BrowserProjectRepository";
import type { AtomicSnapshotFileStore, SnapshotCodec } from "./types";
import type { DocumentOperation } from "../../domain/document/types";

type AppendGate = {
  readonly entered: Promise<void>;
  release(): void;
};

class ControlledAppendHook {
  readonly #entered = new Set<string>();
  readonly #entryResolvers = new Map<string, () => void>();
  readonly #blockers = new Map<string, Promise<void>>();
  readonly #releaseBlockers = new Map<string, () => void>();
  #nextFailure: Error | undefined;

  hold(operationId: string): AppendGate {
    let releaseEntry!: () => void;
    const entrySignal = new Promise<void>((resolve) => {
      releaseEntry = resolve;
    });
    const entered = Promise.race([
      entrySignal,
      new Promise<void>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error(`Append ${operationId} did not start.`)),
          250,
        );
      }),
    ]);
    this.#entryResolvers.set(operationId, releaseEntry);

    let releaseBlocker!: () => void;
    this.#blockers.set(
      operationId,
      new Promise<void>((resolve) => {
        releaseBlocker = resolve;
      }),
    );
    this.#releaseBlockers.set(operationId, releaseBlocker);

    return {
      entered,
      release: () => {
        this.#releaseBlockers.get(operationId)?.();
      },
    };
  }

  hasStarted(operationId: string): boolean {
    return this.#entered.has(operationId);
  }

  failNext(error: Error): void {
    this.#nextFailure = error;
  }

  readonly beforeAppend = async (
    operation: DocumentOperation,
  ): Promise<void> => {
    this.#entered.add(operation.operationId);
    this.#entryResolvers.get(operation.operationId)?.();
    await this.#blockers.get(operation.operationId);
    if (this.#nextFailure) {
      const failure = this.#nextFailure;
      this.#nextFailure = undefined;
      throw failure;
    }
  };
}

class FakeSnapshotFileStore implements AtomicSnapshotFileStore {
  readonly #files = new Map<string, Uint8Array>();
  #nextWriteFailure: Error | undefined;
  #nextDeleteFailure: Error | undefined;

  async writeAtomically(path: string, contents: Uint8Array): Promise<void> {
    if (this.#nextWriteFailure) {
      const failure = this.#nextWriteFailure;
      this.#nextWriteFailure = undefined;
      throw failure;
    }
    this.#files.set(path, contents.slice());
  }

  failNextWrite(error: Error): void {
    this.#nextWriteFailure = error;
  }

  failNextDelete(error: Error): void {
    this.#nextDeleteFailure = error;
  }

  async read(path: string): Promise<Uint8Array> {
    const contents = this.#files.get(path);
    if (!contents) {
      throw new Error(`Missing fake snapshot file ${path}.`);
    }
    return contents.slice();
  }

  async delete(path: string): Promise<void> {
    if (this.#nextDeleteFailure) {
      const failure = this.#nextDeleteFailure;
      this.#nextDeleteFailure = undefined;
      throw failure;
    }
    this.#files.delete(path);
  }

  paths(projectId: string): readonly string[] {
    const prefix = `projects/${projectId}/snapshots/`;
    return [...this.#files.keys()]
      .filter((path) => path.startsWith(prefix))
      .sort();
  }

  async corruptLatest(projectId: string): Promise<void> {
    await this.replaceLatest(projectId, new TextEncoder().encode("{corrupt"));
  }

  async replaceLatest(projectId: string, contents: Uint8Array): Promise<void> {
    const prefix = `projects/${projectId}/snapshots/`;
    const latestPath = [...this.#files.keys()]
      .filter((path) => path.startsWith(prefix))
      .sort()
      .at(-1);
    if (!latestPath) {
      throw new Error(`No snapshot exists for project ${projectId}.`);
    }
    this.#files.set(latestPath, contents.slice());
  }
}

class FakeSnapshotCodec implements SnapshotCodec {
  readonly encoding = "gzip-json-v1";
  compressCount = 0;
  decompressCount = 0;

  async compress(json: string): Promise<Uint8Array> {
    this.compressCount += 1;
    return new TextEncoder().encode(`fake-gzip:${json}`);
  }

  async decompress(payload: Uint8Array): Promise<string> {
    this.decompressCount += 1;
    const encoded = new TextDecoder().decode(payload);
    if (!encoded.startsWith("fake-gzip:")) {
      throw new Error("Invalid fake gzip payload.");
    }
    return encoded.slice("fake-gzip:".length);
  }
}

type FakeOpfsFaults = {
  nextCloseFailure?: Error;
};

class FakeOpfsWritableFile {
  readonly #commit: (contents: Uint8Array) => void;
  readonly #faults: FakeOpfsFaults;
  #contents = new Uint8Array();
  closeCount = 0;

  constructor(commit: (contents: Uint8Array) => void, faults: FakeOpfsFaults) {
    this.#commit = commit;
    this.#faults = faults;
  }

  async write(contents: Uint8Array): Promise<void> {
    this.#contents = contents.slice();
  }

  async close(): Promise<void> {
    this.closeCount += 1;
    if (this.#faults.nextCloseFailure) {
      const failure = this.#faults.nextCloseFailure;
      this.#faults.nextCloseFailure = undefined;
      throw failure;
    }
    this.#commit(this.#contents);
  }
}

class FakeOpfsFileHandle {
  readonly #faults: FakeOpfsFaults;
  #contents: Uint8Array | undefined;
  latestWriter: FakeOpfsWritableFile | undefined;

  constructor(faults: FakeOpfsFaults) {
    this.#faults = faults;
  }

  async createWritable(): Promise<FakeOpfsWritableFile> {
    const writer = new FakeOpfsWritableFile((contents) => {
      this.#contents = contents.slice();
    }, this.#faults);
    this.latestWriter = writer;
    return writer;
  }

  async getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }> {
    if (!this.#contents) {
      throw new Error("Fake OPFS file has not been committed.");
    }
    const contents = this.#contents.slice();
    return {
      arrayBuffer: async () => contents.buffer,
    };
  }
}

class FakeOpfsDirectoryHandle {
  readonly directories = new Map<string, FakeOpfsDirectoryHandle>();
  readonly files = new Map<string, FakeOpfsFileHandle>();
  readonly #faults: FakeOpfsFaults;

  constructor(faults: FakeOpfsFaults = {}) {
    this.#faults = faults;
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FakeOpfsDirectoryHandle> {
    const existing = this.directories.get(name);
    if (existing) {
      return existing;
    }
    if (!options?.create) {
      throw new Error(`Missing fake OPFS directory ${name}.`);
    }
    const directory = new FakeOpfsDirectoryHandle(this.#faults);
    this.directories.set(name, directory);
    return directory;
  }

  async getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FakeOpfsFileHandle> {
    const existing = this.files.get(name);
    if (existing) {
      return existing;
    }
    if (!options?.create) {
      throw new Error(`Missing fake OPFS file ${name}.`);
    }
    const file = new FakeOpfsFileHandle(this.#faults);
    this.files.set(name, file);
    return file;
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.files.delete(name)) {
      throw new Error(`Missing fake OPFS file ${name}.`);
    }
  }

  fileAt(path: string): FakeOpfsFileHandle | undefined {
    const [entry, ...remaining] = path.split("/");
    if (remaining.length === 0) {
      return this.files.get(entry);
    }
    return this.directories.get(entry)?.fileAt(remaining.join("/"));
  }
}

describeProjectRepositoryContract("memory", () => {
  let now = "2026-07-21T00:00:00.000Z";
  const snapshotFiles = new FakeSnapshotFileStore();
  const appends = new ControlledAppendHook();

  return {
    repository: new MemoryProjectRepository({
      now: () => now,
      snapshotFiles,
      beforeAppend: appends.beforeAppend,
    }),
    setNow: (timestamp) => {
      now = timestamp;
    },
    corruptLatestSnapshot: (projectId) =>
      snapshotFiles.corruptLatest(projectId),
    replaceLatestSnapshot: (projectId, snapshot) =>
      snapshotFiles.replaceLatest(
        projectId,
        new TextEncoder().encode(JSON.stringify(snapshot)),
      ),
    holdAppend: (operationId) => appends.hold(operationId),
    hasAppendStarted: (operationId) => appends.hasStarted(operationId),
    failNextAppend: (error) => appends.failNext(error),
    failNextSnapshot: (error) => snapshotFiles.failNextWrite(error),
    cleanup: async () => undefined,
  };
});

let browserDatabaseSequence = 0;

describeProjectRepositoryContract("browser", () => {
  let now = "2026-07-21T00:00:00.000Z";
  const snapshotFiles = new FakeSnapshotFileStore();
  const appends = new ControlledAppendHook();
  const databaseName = `fabric-sketcher-contract-${browserDatabaseSequence++}`;
  const repository = new BrowserProjectRepository({
    databaseName,
    now: () => now,
    snapshotFiles,
    beforeAppend: appends.beforeAppend,
  });

  return {
    repository,
    setNow: (timestamp) => {
      now = timestamp;
    },
    corruptLatestSnapshot: (projectId) =>
      snapshotFiles.corruptLatest(projectId),
    replaceLatestSnapshot: (projectId, snapshot) =>
      snapshotFiles.replaceLatest(
        projectId,
        new TextEncoder().encode(JSON.stringify(snapshot)),
      ),
    holdAppend: (operationId) => appends.hold(operationId),
    hasAppendStarted: (operationId) => appends.hasStarted(operationId),
    failNextAppend: (error) => appends.failNext(error),
    failNextSnapshot: (error) => snapshotFiles.failNextWrite(error),
    cleanup: async () => {
      await repository.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
  };
});

async function deleteDatabase(databaseName: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function openDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoredOperation(
  databaseName: string,
  projectId: string,
  sequence: number,
): Promise<Record<string, unknown> | undefined> {
  const database = await openDatabase(databaseName);
  try {
    const transaction = database.transaction("operations", "readonly");
    return await new Promise<Record<string, unknown> | undefined>(
      (resolve, reject) => {
        const request = transaction
          .objectStore("operations")
          .get([projectId, sequence]);
        request.onsuccess = () =>
          resolve(request.result as Record<string, unknown> | undefined);
        request.onerror = () => reject(request.error);
      },
    );
  } finally {
    database.close();
  }
}

async function injectStoredOperation(
  databaseName: string,
  operation: DocumentOperation,
): Promise<void> {
  const database = await openDatabase(databaseName);
  try {
    const transaction = database.transaction(
      ["operations", "projects"],
      "readwrite",
    );
    const projects = transaction.objectStore("projects");
    const project = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const request = projects.get(operation.projectId);
        request.onsuccess = () =>
          resolve(request.result as Record<string, unknown>);
        request.onerror = () => reject(request.error);
      },
    );
    projects.put({ ...project, latestSequence: operation.sequence });
    transaction.objectStore("operations").put(operation);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function replaceStoredInitialDocument(
  databaseName: string,
  projectId: string,
  initialDocument: Readonly<Record<string, unknown>>,
): Promise<void> {
  const database = await openDatabase(databaseName);
  try {
    const transaction = database.transaction("projects", "readwrite");
    const projects = transaction.objectStore("projects");
    const project = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const request = projects.get(projectId);
        request.onsuccess = () =>
          resolve(request.result as Record<string, unknown>);
        request.onerror = () => reject(request.error);
      },
    );
    projects.put({ ...project, initialDocument });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

describe("BrowserProjectRepository IndexedDB integration", () => {
  it("rejects invalid brush values before appending a durable journal entry", async () => {
    const databaseName = `fabric-sketcher-invalid-append-${browserDatabaseSequence++}`;
    const repository = new BrowserProjectRepository({
      databaseName,
      snapshotFiles: new FakeSnapshotFileStore(),
    });
    const initial = createDocument({
      projectId: "project-1",
      title: "Invalid",
    });
    const brush = stroke().brush;
    const invalidBrushes = [
      { ...brush, opacity: Number.NaN },
      { ...brush, opacity: Number.POSITIVE_INFINITY },
      { ...brush, texture: { ...brush.texture, scale: 0 } },
      { ...brush, texture: { ...brush.texture, strength: 1.01 } },
      { ...brush, texture: { ...brush.texture, scatter: -0.01 } },
    ];

    try {
      await repository.createProject(initial);

      for (const [index, invalidBrush] of invalidBrushes.entries()) {
        await expect(
          repository.appendOperation(
            stroke({
              operationId: `invalid-${index}`,
              brush: invalidBrush,
            }),
          ),
        ).rejects.toThrow("Invalid document operation.");
      }
      await expect(
        readStoredOperation(databaseName, "project-1", 1),
      ).resolves.toBeUndefined();
    } finally {
      await repository.close();
      await deleteDatabase(databaseName);
    }
  });

  it("rejects a malformed foundation before appending a durable journal entry", async () => {
    const databaseName = `fabric-sketcher-invalid-foundation-${browserDatabaseSequence++}`;
    const repository = new BrowserProjectRepository({
      databaseName,
      snapshotFiles: new FakeSnapshotFileStore(),
    });
    const initial = createDocument({
      projectId: "project-1",
      title: "Invalid foundation",
    });
    const malformed = {
      ...foundation(),
      foundation: {
        ...foundation().foundation,
        opacity: Number.NaN,
      },
    };

    try {
      await repository.createProject(initial);

      await expect(
        repository.appendOperation(malformed as DocumentOperation),
      ).rejects.toThrow("Invalid document operation.");
      await expect(
        readStoredOperation(databaseName, "project-1", 1),
      ).resolves.toBeUndefined();
    } finally {
      await repository.close();
      await deleteDatabase(databaseName);
    }
  });

  it("rejects invalid brush values when recovering a stored journal entry", async () => {
    const databaseName = `fabric-sketcher-invalid-recovery-${browserDatabaseSequence++}`;
    const repository = new BrowserProjectRepository({
      databaseName,
      snapshotFiles: new FakeSnapshotFileStore(),
    });
    const initial = createDocument({
      projectId: "project-1",
      title: "Recovery",
    });
    const operation = stroke({
      brush: {
        ...stroke().brush,
        opacity: Number.NaN,
      },
    });

    try {
      await repository.createProject(initial);
      await injectStoredOperation(databaseName, operation);

      await expect(repository.loadProject("project-1")).rejects.toThrow(
        "Invalid document operation.",
      );
    } finally {
      await repository.close();
      await deleteDatabase(databaseName);
    }
  });

  it("migrates a schema-v1 initial document before journal replay", async () => {
    const databaseName = `fabric-sketcher-legacy-initial-${browserDatabaseSequence++}`;
    const repository = new BrowserProjectRepository({
      databaseName,
      snapshotFiles: new FakeSnapshotFileStore(),
    });
    const initial = createDocument({
      projectId: "project-1",
      title: "Legacy initial document",
    });
    const schemaV1Initial: Record<string, unknown> = structuredClone(initial);
    delete schemaV1Initial.foundation;

    try {
      await repository.createProject(initial);
      await replaceStoredInitialDocument(databaseName, "project-1", {
        ...schemaV1Initial,
        schemaVersion: 1,
      });

      await expect(repository.loadProject("project-1")).resolves.toEqual(
        initial,
      );
    } finally {
      await repository.close();
      await deleteDatabase(databaseName);
    }
  });

  it("normalizes a legacy pencil append without rewriting a legacy journal during recovery", async () => {
    const databaseName = `fabric-sketcher-legacy-journal-${browserDatabaseSequence++}`;
    const repository = new BrowserProjectRepository({
      databaseName,
      snapshotFiles: new FakeSnapshotFileStore(),
    });
    const initial = createDocument({ projectId: "project-1", title: "Legacy" });
    const source = stroke();
    const legacyBrush = {
      id: source.brush.id,
      color: source.brush.color,
      opacity: source.brush.opacity,
      size: source.brush.size,
      pressureSize: source.brush.pressureSize,
      pressureOpacity: source.brush.pressureOpacity,
      tiltShape: source.brush.tiltShape,
    };
    const legacyOperation = {
      ...source,
      brush: legacyBrush as typeof source.brush,
    };

    try {
      await repository.createProject(initial);
      await repository.appendOperation(legacyOperation);
      expect(
        (await readStoredOperation(databaseName, "project-1", 1))?.brush,
      ).toMatchObject({
        texture: { kind: "graphite" },
      });

      const rawLegacy = {
        ...legacyOperation,
        operationId: "legacy-stored",
        sequence: 2,
      };
      await injectStoredOperation(databaseName, rawLegacy);
      const loaded = await repository.loadProject("project-1");

      expect(loaded.strokes[1]?.brush.texture).toMatchObject({
        kind: "graphite",
      });
      expect(
        (await readStoredOperation(databaseName, "project-1", 2))?.brush,
      ).not.toHaveProperty("texture");
    } finally {
      await repository.close();
      await deleteDatabase(databaseName);
    }
  });

  it("keeps memory snapshot confirmation successful when expired-file cleanup fails", async () => {
    const snapshotFiles = new FakeSnapshotFileStore();
    const repository = new MemoryProjectRepository({ snapshotFiles });
    const initial = createDocument({
      projectId: "project-1",
      title: "Cleanup",
    });
    const committed = documentReducer(initial, stroke());
    const hidden = documentReducer(committed, visibility());
    const visible = {
      ...documentReducer(
        hidden,
        visibility({
          operationId: "visibility-2",
          sequence: 3,
          visible: true,
        }),
      ),
      title: "Cleanup confirmed",
    } as const;

    await repository.createProject(initial);
    await repository.appendOperation(stroke());
    await repository.writeSnapshot(committed);
    await repository.appendOperation(visibility());
    await repository.writeSnapshot(hidden);
    await repository.appendOperation(
      visibility({
        operationId: "visibility-2",
        sequence: 3,
        visible: true,
      }),
    );
    snapshotFiles.failNextDelete(new Error("simulated cleanup failure"));

    await expect(repository.writeSnapshot(visible)).resolves.toBeUndefined();
    await expect(repository.loadProject("project-1")).resolves.toEqual(visible);
    await expect(repository.listProjects()).resolves.toEqual([
      expect.objectContaining({ title: "Cleanup confirmed" }),
    ]);
    await expect(repository.writeSnapshot(visible)).resolves.toBeUndefined();
  });

  it("writes, reads, and deletes OPFS snapshots only through safe paths and committed closes", async () => {
    const root = new FakeOpfsDirectoryHandle();
    const snapshots = new NavigatorOpfsSnapshotFileStore(async () => root);
    const path = "projects/project-1/snapshots/1.json";
    const contents = new TextEncoder().encode('{"schemaVersion":1}');

    await snapshots.writeAtomically(path, contents);

    expect([...(await snapshots.read(path))]).toEqual([...contents]);
    expect(root.fileAt(path)?.latestWriter?.closeCount).toBe(1);
    await expect(
      snapshots.writeAtomically("projects/../escaped.json", contents),
    ).rejects.toThrow("Unsafe OPFS snapshot path");

    await snapshots.delete(path);
    await expect(snapshots.read(path)).rejects.toThrow(
      "Missing fake OPFS file",
    );
  });

  it("uses navigator OPFS by default and encodes project IDs into one safe path segment", async () => {
    const databaseName = `fabric-sketcher-default-opfs-${browserDatabaseSequence++}`;
    const root = new FakeOpfsDirectoryHandle();
    const projectId = "../unsafe/project";
    const repository = new BrowserProjectRepository({
      databaseName,
      environment: {
        storage: {
          getDirectory: async () => root,
        },
      },
    });
    const initial = createDocument({ projectId, title: "Safe OPFS path" });
    const operation = stroke({
      projectId,
      layerId: `paint-layer:${projectId}`,
    });
    const committed = documentReducer(initial, operation);

    try {
      expect(repository.storageMode).toBe("opfs");
      await repository.createProject(initial);
      await repository.appendOperation(operation);
      await repository.writeSnapshot(committed);

      expect(
        root.fileAt("projects/%2E%2E%2Funsafe%2Fproject/snapshots/1.json"),
      ).toBeDefined();
    } finally {
      await repository.close();
      await deleteDatabase(databaseName);
    }
  });

  it("falls back to gzip IndexedDB when runtime OPFS is unavailable and remembers degradation", async () => {
    const databaseName = `fabric-sketcher-runtime-degraded-${browserDatabaseSequence++}`;
    let getDirectoryCount = 0;
    const environment = {
      storage: {
        getDirectory: async (): Promise<FakeOpfsDirectoryHandle> => {
          getDirectoryCount += 1;
          throw new Error("simulated OPFS unavailable");
        },
      },
    };
    const initial = createDocument({
      projectId: "project-1",
      title: "Runtime degradation",
    });
    const committed = documentReducer(initial, stroke());
    const repository = new BrowserProjectRepository({
      databaseName,
      environment,
    });
    let reopenedRepository: BrowserProjectRepository | undefined;
    let database: IDBDatabase | undefined;

    try {
      expect(repository.storageMode).toBe("opfs");
      await repository.createProject(initial);
      await repository.appendOperation(stroke());
      await expect(
        repository.writeSnapshot(committed),
      ).resolves.toBeUndefined();
      expect(repository.storageMode).toBe("indexeddb-degraded");
      const attemptsAfterFallback = getDirectoryCount;
      expect(attemptsAfterFallback).toBeGreaterThanOrEqual(1);

      database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction(
        ["snapshotIndex", "settings"],
        "readonly",
      );
      const snapshot = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const request = transaction.objectStore("snapshotIndex").getAll();
          request.onsuccess = () =>
            resolve(request.result[0] as Record<string, unknown>);
          request.onerror = () => reject(request.error);
        },
      );
      const storageMode = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const request = transaction
            .objectStore("settings")
            .get("storageMode");
          request.onsuccess = () =>
            resolve(request.result as Record<string, unknown>);
          request.onerror = () => reject(request.error);
        },
      );
      expect(snapshot).toMatchObject({
        location: "indexeddb",
        encoding: "gzip-json-v1",
      });
      expect([
        ...((snapshot.payload as Uint8Array | undefined)?.slice(0, 2) ?? []),
      ]).toEqual([0x1f, 0x8b]);
      expect(storageMode).toEqual({
        name: "storageMode",
        value: "indexeddb-degraded",
      });
      database.close();
      database = undefined;
      await repository.close();

      reopenedRepository = new BrowserProjectRepository({
        databaseName,
        environment,
      });
      await expect(
        reopenedRepository.loadProject("project-1"),
      ).resolves.toEqual(committed);
      expect(reopenedRepository.storageMode).toBe("indexeddb-degraded");
      expect(getDirectoryCount).toBe(attemptsAfterFallback);
    } finally {
      database?.close();
      await repository.close();
      await reopenedRepository?.close();
      await deleteDatabase(databaseName);
    }
  });

  it("falls back when OPFS atomic close cannot commit the snapshot", async () => {
    const databaseName = `fabric-sketcher-close-degraded-${browserDatabaseSequence++}`;
    const root = new FakeOpfsDirectoryHandle({
      nextCloseFailure: new Error("simulated OPFS close failure"),
    });
    const repository = new BrowserProjectRepository({
      databaseName,
      environment: {
        storage: { getDirectory: async () => root },
      },
    });
    const initial = createDocument({
      projectId: "project-1",
      title: "Close degradation",
    });
    const committed = documentReducer(initial, stroke());

    try {
      await repository.createProject(initial);
      await repository.appendOperation(stroke());
      await expect(
        repository.writeSnapshot(committed),
      ).resolves.toBeUndefined();
      expect(repository.storageMode).toBe("indexeddb-degraded");
      await expect(repository.loadProject("project-1")).resolves.toEqual(
        committed,
      );
    } finally {
      await repository.close();
      await deleteDatabase(databaseName);
    }
  });

  it("degrades after runtime OPFS read unavailability and recovers through the journal", async () => {
    const databaseName = `fabric-sketcher-read-degraded-${browserDatabaseSequence++}`;
    const root = new FakeOpfsDirectoryHandle();
    const initial = createDocument({
      projectId: "project-1",
      title: "Read degradation",
    });
    const committed = documentReducer(initial, stroke());
    const writerRepository = new BrowserProjectRepository({
      databaseName,
      environment: {
        storage: { getDirectory: async () => root },
      },
    });
    let unavailableReadCount = 0;
    const unavailableEnvironment = {
      storage: {
        getDirectory: async (): Promise<FakeOpfsDirectoryHandle> => {
          unavailableReadCount += 1;
          throw new Error("simulated OPFS read unavailability");
        },
      },
    };
    let degradedRepository: BrowserProjectRepository | undefined;
    let reopenedRepository: BrowserProjectRepository | undefined;

    try {
      await writerRepository.createProject(initial);
      await writerRepository.appendOperation(stroke());
      await writerRepository.writeSnapshot(committed);
      await writerRepository.close();

      degradedRepository = new BrowserProjectRepository({
        databaseName,
        environment: unavailableEnvironment,
      });
      await expect(
        degradedRepository.loadProject("project-1"),
      ).resolves.toEqual(committed);
      expect(degradedRepository.storageMode).toBe("indexeddb-degraded");
      const attemptsAfterReadFallback = unavailableReadCount;
      await degradedRepository.writeSnapshot(committed);
      expect(unavailableReadCount).toBe(attemptsAfterReadFallback);
      await degradedRepository.close();

      reopenedRepository = new BrowserProjectRepository({
        databaseName,
        environment: unavailableEnvironment,
      });
      await expect(
        reopenedRepository.loadProject("project-1"),
      ).resolves.toEqual(committed);
      expect(reopenedRepository.storageMode).toBe("indexeddb-degraded");
      expect(unavailableReadCount).toBe(attemptsAfterReadFallback);
    } finally {
      await writerRepository.close();
      await degradedRepository?.close();
      await reopenedRepository?.close();
      await deleteDatabase(databaseName);
    }
  });

  it("uses actual gzip bytes for the production IndexedDB snapshot codec", async () => {
    const codec = new GzipSnapshotCodec();
    const json = JSON.stringify({ repeated: "fabric-sketcher-".repeat(100) });

    const compressed = await codec.compress(json);

    expect([...compressed.slice(0, 2)]).toEqual([0x1f, 0x8b]);
    expect(compressed.byteLength).toBeLessThan(
      new TextEncoder().encode(json).byteLength,
    );
    await expect(codec.decompress(compressed)).resolves.toBe(json);
  });

  it("keeps IndexedDB schema version 1 with the required stores and unique operation ID index", async () => {
    const databaseName = `fabric-sketcher-schema-${browserDatabaseSequence++}`;
    const repository = new BrowserProjectRepository({
      databaseName,
      snapshotFiles: new FakeSnapshotFileStore(),
    });
    let database: IDBDatabase | undefined;

    try {
      await repository.listProjects();
      database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      expect(database.version).toBe(1);
      expect([...database.objectStoreNames]).toEqual([
        "operations",
        "projects",
        "settings",
        "snapshotIndex",
      ]);
      const operationIdIndex = database
        .transaction("operations", "readonly")
        .objectStore("operations")
        .index("operationId");
      expect(operationIdIndex.unique).toBe(true);
    } finally {
      database?.close();
      await repository.close();
      await deleteDatabase(databaseName);
    }
  });

  it("aborts a staged append without exposing a partial operation", async () => {
    const databaseName = `fabric-sketcher-interruption-${browserDatabaseSequence++}`;
    const initial = createDocument({
      projectId: "project-1",
      title: "Interrupted",
    });
    let interrupt = true;
    const interruptedRepository = new BrowserProjectRepository({
      databaseName,
      snapshotFiles: new FakeSnapshotFileStore(),
      afterAppendStaged: () => {
        if (interrupt) {
          interrupt = false;
          throw new Error("simulated process interruption");
        }
      },
    });
    let recoveredRepository: BrowserProjectRepository | undefined;

    try {
      await interruptedRepository.createProject(initial);
      await expect(
        interruptedRepository.appendOperation(stroke()),
      ).rejects.toMatchObject({
        name: "PersistenceError",
        retryable: true,
      });
      await interruptedRepository.close();

      recoveredRepository = new BrowserProjectRepository({
        databaseName,
        snapshotFiles: new FakeSnapshotFileStore(),
      });
      await expect(
        recoveredRepository.loadProject("project-1"),
      ).resolves.toEqual(initial);
      await expect(
        recoveredRepository.appendOperation(stroke()),
      ).resolves.toBeUndefined();
      await expect(
        recoveredRepository.loadProject("project-1"),
      ).resolves.toMatchObject({ operationSequence: 1 });
      await recoveredRepository.close();
    } finally {
      await interruptedRepository.close();
      await recoveredRepository?.close();
      await deleteDatabase(databaseName);
    }
  });

  it("retains exactly the two newest confirmed snapshot generations", async () => {
    const databaseName = `fabric-sketcher-retention-${browserDatabaseSequence++}`;
    const snapshotFiles = new FakeSnapshotFileStore();
    const repository = new BrowserProjectRepository({
      databaseName,
      snapshotFiles,
    });
    const initial = createDocument({
      projectId: "project-1",
      title: "Retention",
    });
    const committed = documentReducer(initial, stroke());
    const hidden = documentReducer(committed, visibility());
    const visible = documentReducer(
      hidden,
      visibility({
        operationId: "visibility-2",
        sequence: 3,
        visible: true,
      }),
    );
    let database: IDBDatabase | undefined;

    try {
      await repository.createProject(initial);
      await repository.appendOperation(stroke());
      await repository.writeSnapshot(committed);
      await repository.appendOperation(visibility());
      await repository.writeSnapshot(hidden);
      await repository.appendOperation(
        visibility({
          operationId: "visibility-2",
          sequence: 3,
          visible: true,
        }),
      );
      await repository.writeSnapshot(visible);

      expect(snapshotFiles.paths("project-1")).toEqual([
        "projects/project-1/snapshots/2.json",
        "projects/project-1/snapshots/3.json",
      ]);
      database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const snapshotCount = await new Promise<number>((resolve, reject) => {
        const request = database!
          .transaction("snapshotIndex", "readonly")
          .objectStore("snapshotIndex")
          .count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      expect(snapshotCount).toBe(2);
    } finally {
      database?.close();
      await repository.close();
      await deleteDatabase(databaseName);
    }
  });

  it("does not confirm or retain an interrupted OPFS snapshot write", async () => {
    const databaseName = `fabric-sketcher-snapshot-interruption-${browserDatabaseSequence++}`;
    const snapshotFiles = new FakeSnapshotFileStore();
    let interrupt = true;
    const repository = new BrowserProjectRepository({
      databaseName,
      snapshotFiles,
      afterSnapshotFileWritten: () => {
        if (interrupt) {
          interrupt = false;
          throw new Error("simulated interruption after OPFS write");
        }
      },
    });
    const initial = createDocument({
      projectId: "project-1",
      title: "Atomic snapshot",
    });
    const committed = documentReducer(initial, stroke());

    try {
      await repository.createProject(initial);
      await repository.appendOperation(stroke());
      await expect(repository.writeSnapshot(committed)).rejects.toMatchObject({
        name: "PersistenceError",
        retryable: true,
      });
      expect(snapshotFiles.paths("project-1")).toEqual([]);
      await expect(repository.loadProject("project-1")).resolves.toEqual(
        committed,
      );

      await expect(
        repository.writeSnapshot(committed),
      ).resolves.toBeUndefined();
      expect(snapshotFiles.paths("project-1")).toEqual([
        "projects/project-1/snapshots/1.json",
      ]);
    } finally {
      await repository.close();
      await deleteDatabase(databaseName);
    }
  });

  it("stores compressed snapshots in IndexedDB and marks OPFS degradation", async () => {
    const databaseName = `fabric-sketcher-degraded-${browserDatabaseSequence++}`;
    const snapshotCodec = new FakeSnapshotCodec();
    const repository = new BrowserProjectRepository({
      databaseName,
      snapshotFiles: null,
      snapshotCodec,
    });
    const initial = createDocument({
      projectId: "project-1",
      title: "Degraded",
    });
    const foundationOperation = foundation();
    const committed = documentReducer(initial, foundationOperation);
    let recoveredRepository: BrowserProjectRepository | undefined;
    let database: IDBDatabase | undefined;

    try {
      expect(repository.storageMode).toBe("indexeddb-degraded");
      await repository.createProject(initial);
      await repository.appendOperation(foundationOperation);
      await repository.writeSnapshot(committed);

      expect(snapshotCodec.compressCount).toBe(1);
      database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction(
        ["snapshotIndex", "settings"],
        "readonly",
      );
      const snapshot = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const request = transaction.objectStore("snapshotIndex").getAll();
          request.onsuccess = () =>
            resolve(request.result[0] as Record<string, unknown>);
          request.onerror = () => reject(request.error);
        },
      );
      const storageMode = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const request = transaction
            .objectStore("settings")
            .get("storageMode");
          request.onsuccess = () =>
            resolve(request.result as Record<string, unknown>);
          request.onerror = () => reject(request.error);
        },
      );
      expect(snapshot).toMatchObject({
        location: "indexeddb",
        encoding: "gzip-json-v1",
      });
      expect(storageMode).toEqual({
        name: "storageMode",
        value: "indexeddb-degraded",
      });
      database.close();
      database = undefined;
      await repository.close();

      recoveredRepository = new BrowserProjectRepository({
        databaseName,
        snapshotFiles: null,
        snapshotCodec,
      });
      await expect(
        recoveredRepository.loadProject("project-1"),
      ).resolves.toEqual(committed);
      expect(snapshotCodec.decompressCount).toBe(1);
    } finally {
      database?.close();
      await repository.close();
      await recoveredRepository?.close();
      await deleteDatabase(databaseName);
    }
  });
});
