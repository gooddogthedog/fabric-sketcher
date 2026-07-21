import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDocument } from "../../domain/document/createDocument";
import { documentReducer } from "../../domain/document/documentReducer";
import type {
  StrokeOperation,
  StrokeVisibilityOperation,
} from "../../domain/document/types";
import type { ProjectRepository } from "./types";
import { PersistenceError } from "./types";

export const stroke = (
  overrides: Partial<StrokeOperation> = {},
): StrokeOperation => ({
  type: "stroke.committed",
  operationId: "stroke-1",
  projectId: "project-1",
  layerId: "paint-layer:project-1",
  sequence: 1,
  committedAt: "2026-07-21T10:01:00.000Z",
  brush: {
    id: "studio-pencil-v1",
    color: "#192033",
    opacity: 1,
    size: 8,
    pressureSize: 1,
    pressureOpacity: 1,
    tiltShape: 0,
  },
  samples: [
    {
      x: 10,
      y: 20,
      pressure: 0.5,
      tiltX: 0,
      tiltY: 0,
      twist: 0,
      altitudeAngle: null,
      azimuthAngle: null,
      time: 0,
    },
    {
      x: 12,
      y: 22,
      pressure: 0.6,
      tiltX: 0,
      tiltY: 0,
      twist: 0,
      altitudeAngle: null,
      azimuthAngle: null,
      time: 1,
    },
  ],
  ...overrides,
});

export const visibility = (
  overrides: Partial<StrokeVisibilityOperation> = {},
): StrokeVisibilityOperation => ({
  type: "stroke.visibility-set",
  operationId: "visibility-1",
  projectId: "project-1",
  sequence: 2,
  committedAt: "2026-07-21T10:02:00.000Z",
  targetOperationId: "stroke-1",
  visible: false,
  ...overrides,
});

export type ProjectRepositoryContractHarness = Readonly<{
  repository: ProjectRepository;
  setNow(isoTimestamp: string): void;
  corruptLatestSnapshot(projectId: string): Promise<void>;
  holdAppend(operationId: string): Readonly<{
    entered: Promise<void>;
    release(): void;
  }>;
  hasAppendStarted(operationId: string): boolean;
  failNextAppend(error: Error): void;
  failNextSnapshot(error: Error): void;
  cleanup(): Promise<void>;
}>;

export type ProjectRepositoryContractFactory = () =>
  ProjectRepositoryContractHarness | Promise<ProjectRepositoryContractHarness>;

export function describeProjectRepositoryContract(
  adapterName: string,
  createHarness: ProjectRepositoryContractFactory,
): void {
  describe(`${adapterName} ProjectRepository contract`, () => {
    let harness: ProjectRepositoryContractHarness;

    beforeEach(async () => {
      harness = await createHarness();
    });

    afterEach(async () => {
      await harness.cleanup();
    });

    it("creates, lists, and loads projects ordered by most recently updated", async () => {
      harness.setNow("2026-07-21T10:00:00.000Z");
      const older = createDocument({ projectId: "older", title: "Older" });
      await harness.repository.createProject(older);

      harness.setNow("2026-07-21T11:00:00.000Z");
      const newer = createDocument({ projectId: "newer", title: "Newer" });
      await harness.repository.createProject(newer);

      expect(await harness.repository.listProjects()).toEqual([
        {
          projectId: "newer",
          title: "Newer",
          createdAt: "2026-07-21T11:00:00.000Z",
          updatedAt: "2026-07-21T11:00:00.000Z",
          width: 2480,
          height: 3508,
        },
        {
          projectId: "older",
          title: "Older",
          createdAt: "2026-07-21T10:00:00.000Z",
          updatedAt: "2026-07-21T10:00:00.000Z",
          width: 2480,
          height: 3508,
        },
      ]);
      await expect(harness.repository.loadProject("older")).resolves.toEqual(
        older,
      );
    });

    it("appends and replays operations in sequence", async () => {
      const document = createDocument({
        projectId: "project-1",
        title: "Journal",
      });
      await harness.repository.createProject(document);
      await harness.repository.appendOperation(stroke());
      await harness.repository.appendOperation(visibility());

      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toMatchObject({
        operationSequence: 2,
        strokes: [stroke()],
        hiddenStrokeIds: ["stroke-1"],
      });
    });

    it("treats a duplicate visibility operation ID as an idempotent append", async () => {
      await harness.repository.createProject(
        createDocument({ projectId: "project-1", title: "Idempotence" }),
      );
      await harness.repository.appendOperation(stroke());
      await harness.repository.appendOperation(visibility());

      await expect(
        harness.repository.appendOperation(
          visibility({ sequence: 99, visible: true }),
        ),
      ).resolves.toBeUndefined();
      await harness.repository.appendOperation(
        visibility({
          operationId: "visibility-2",
          sequence: 3,
          visible: true,
        }),
      );

      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toMatchObject({
        operationSequence: 3,
        hiddenStrokeIds: [],
      });
    });

    it("enforces operation ID idempotence across the repository", async () => {
      await harness.repository.createProject(
        createDocument({ projectId: "project-1", title: "Original" }),
      );
      await harness.repository.createProject(
        createDocument({ projectId: "project-2", title: "Duplicate target" }),
      );
      await harness.repository.appendOperation(stroke());

      await expect(
        harness.repository.appendOperation(
          stroke({
            projectId: "project-2",
            layerId: "paint-layer:project-2",
          }),
        ),
      ).resolves.toBeUndefined();
      await expect(
        harness.repository.loadProject("project-2"),
      ).resolves.toMatchObject({ operationSequence: 0, strokes: [] });
    });

    it("rejects a sequence gap without advancing or corrupting history", async () => {
      const initial = createDocument({
        projectId: "project-1",
        title: "No gaps",
      });
      await harness.repository.createProject(initial);

      await expect(
        harness.repository.appendOperation(stroke({ sequence: 2 })),
      ).rejects.toThrow("Expected operation sequence 1, received 2.");
      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toEqual(initial);
      await expect(
        harness.repository.appendOperation(stroke()),
      ).resolves.toBeUndefined();
    });

    it("serializes concurrent appends to the same project", async () => {
      await harness.repository.createProject(
        createDocument({ projectId: "project-1", title: "Serialized" }),
      );
      const firstGate = harness.holdAppend("stroke-1");

      const firstAppend = harness.repository.appendOperation(stroke());
      await firstGate.entered;
      const secondAppend = harness.repository.appendOperation(visibility());
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(harness.hasAppendStarted("visibility-1")).toBe(false);
      firstGate.release();
      await Promise.all([firstAppend, secondAppend]);

      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toMatchObject({ operationSequence: 2 });
    });

    it("allows concurrent appends to different projects to proceed independently", async () => {
      await harness.repository.createProject(
        createDocument({ projectId: "project-1", title: "First" }),
      );
      await harness.repository.createProject(
        createDocument({ projectId: "project-2", title: "Second" }),
      );
      const firstGate = harness.holdAppend("stroke-1");
      const secondGate = harness.holdAppend("stroke-2");

      const firstAppend = harness.repository.appendOperation(stroke());
      await firstGate.entered;
      const secondAppend = harness.repository.appendOperation(
        stroke({
          operationId: "stroke-2",
          projectId: "project-2",
          layerId: "paint-layer:project-2",
        }),
      );

      await secondGate.entered;
      firstGate.release();
      secondGate.release();
      await Promise.all([firstAppend, secondAppend]);

      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toMatchObject({ operationSequence: 1 });
      await expect(
        harness.repository.loadProject("project-2"),
      ).resolves.toMatchObject({ operationSequence: 1 });
    });

    it("preserves caller memory after a retryable persistence failure", async () => {
      const initial = createDocument({
        projectId: "project-1",
        title: "Retryable",
      });
      const inMemoryDocument = documentReducer(initial, stroke());
      const unchangedDocument = structuredClone(inMemoryDocument);
      await harness.repository.createProject(initial);
      const storageFailure = new Error("simulated storage failure");
      harness.failNextAppend(storageFailure);

      await expect(
        harness.repository.appendOperation(stroke()),
      ).rejects.toMatchObject({
        name: PersistenceError.name,
        retryable: true,
        cause: storageFailure,
      });
      expect(inMemoryDocument).toEqual(unchangedDocument);

      await expect(
        harness.repository.appendOperation(stroke()),
      ).resolves.toBeUndefined();
      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toEqual(inMemoryDocument);
    });

    it("keeps an in-memory document retryable after a snapshot failure", async () => {
      const initial = createDocument({
        projectId: "project-1",
        title: "Snapshot retry",
      });
      const inMemoryDocument = documentReducer(initial, stroke());
      const unchangedDocument = structuredClone(inMemoryDocument);
      await harness.repository.createProject(initial);
      await harness.repository.appendOperation(stroke());
      const storageFailure = new Error("simulated snapshot failure");
      harness.failNextSnapshot(storageFailure);

      await expect(
        harness.repository.writeSnapshot(inMemoryDocument),
      ).rejects.toMatchObject({
        name: PersistenceError.name,
        retryable: true,
        cause: storageFailure,
      });
      expect(inMemoryDocument).toEqual(unchangedDocument);

      await expect(
        harness.repository.writeSnapshot(inMemoryDocument),
      ).resolves.toBeUndefined();
      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toEqual(inMemoryDocument);
    });

    it("does not confirm a snapshot ahead of the durable journal", async () => {
      const initial = createDocument({
        projectId: "project-1",
        title: "Snapshot sequence",
      });
      const uncommittedDocument = documentReducer(initial, stroke());
      await harness.repository.createProject(initial);

      await expect(
        harness.repository.writeSnapshot(uncommittedDocument),
      ).rejects.toMatchObject({
        name: PersistenceError.name,
        retryable: true,
      });
      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toEqual(initial);
    });

    it("loads the newest valid snapshot and replays only later journal entries", async () => {
      const initial = createDocument({
        projectId: "project-1",
        title: "Snapshot",
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

      await harness.repository.createProject(initial);
      await harness.repository.appendOperation(stroke());
      await harness.repository.appendOperation(visibility());
      await harness.repository.writeSnapshot(hidden);
      await harness.repository.appendOperation(
        visibility({
          operationId: "visibility-2",
          sequence: 3,
          visible: true,
        }),
      );

      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toEqual(visible);
    });

    it("falls back to the prior snapshot generation when the newest is corrupt", async () => {
      const initial = createDocument({
        projectId: "project-1",
        title: "Snapshot fallback",
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

      await harness.repository.createProject(initial);
      await harness.repository.appendOperation(stroke());
      await harness.repository.writeSnapshot(committed);
      await harness.repository.appendOperation(visibility());
      await harness.repository.writeSnapshot(hidden);
      await harness.repository.appendOperation(
        visibility({
          operationId: "visibility-2",
          sequence: 3,
          visible: true,
        }),
      );
      await harness.corruptLatestSnapshot("project-1");

      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toEqual(visible);
    });

    it("deletes a project and its recoverable state", async () => {
      const initial = createDocument({
        projectId: "project-1",
        title: "Disposable",
      });
      await harness.repository.createProject(initial);
      await harness.repository.appendOperation(stroke());
      await harness.repository.writeSnapshot(
        documentReducer(initial, stroke()),
      );

      await harness.repository.deleteProject("project-1");

      await expect(harness.repository.listProjects()).resolves.toEqual([]);
      await expect(harness.repository.loadProject("project-1")).rejects.toThrow(
        "Project project-1 does not exist.",
      );
    });
  });
}
