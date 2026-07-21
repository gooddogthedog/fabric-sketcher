import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createDocument } from "../../domain/document/createDocument";
import { documentReducer } from "../../domain/document/documentReducer";
import {
  describeProjectRepositoryContract,
  stroke,
  visibility,
} from "./ProjectRepository.contract";
import { MemoryProjectRepository } from "./MemoryProjectRepository";
import {
  BrowserProjectRepository,
  GzipSnapshotCodec,
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

  async read(path: string): Promise<Uint8Array> {
    const contents = this.#files.get(path);
    if (!contents) {
      throw new Error(`Missing fake snapshot file ${path}.`);
    }
    return contents.slice();
  }

  async delete(path: string): Promise<void> {
    this.#files.delete(path);
  }

  paths(projectId: string): readonly string[] {
    const prefix = `projects/${projectId}/snapshots/`;
    return [...this.#files.keys()]
      .filter((path) => path.startsWith(prefix))
      .sort();
  }

  async corruptLatest(projectId: string): Promise<void> {
    const prefix = `projects/${projectId}/snapshots/`;
    const latestPath = [...this.#files.keys()]
      .filter((path) => path.startsWith(prefix))
      .sort()
      .at(-1);
    if (!latestPath) {
      throw new Error(`No snapshot exists for project ${projectId}.`);
    }
    this.#files.set(latestPath, new TextEncoder().encode("{corrupt"));
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

describe("BrowserProjectRepository IndexedDB integration", () => {
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

  it("creates schema version 1 with the required stores and unique operation ID index", async () => {
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
    const committed = documentReducer(initial, stroke());
    let recoveredRepository: BrowserProjectRepository | undefined;
    let database: IDBDatabase | undefined;

    try {
      expect(repository.storageMode).toBe("indexeddb-degraded");
      await repository.createProject(initial);
      await repository.appendOperation(stroke());
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
