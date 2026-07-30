import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDocument } from "../../domain/document/createDocument";
import { documentReducer } from "../../domain/document/documentReducer";
import type {
  EraseOperation,
  FoundationSetOperation,
  FoundationState,
  StrokeOperation,
  StrokeVisibilityOperation,
} from "../../domain/document/types";
import type { ProjectRepository } from "./types";
import { PersistenceError } from "./types";
import { BRUSH_PRESETS, getBrushPreset } from "../../engine/brush/presets";

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
    texture: {
      kind: "graphite",
      scale: 18,
      strength: 0.34,
      angle: 0,
      scatter: 0.18,
    },
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

const unavailableFoundation: FoundationState = {
  assetId: "retired-foundation",
  assetVersion: 7,
  foundationType: "figure",
  transform: [1, 0, 36, 0, 1, 48, 0, 0, 1],
  opacity: 0.34,
  visible: true,
  visibleLandmarkGroups: ["outline", "center", "levels"],
  locked: true,
  includeInExport: false,
};

export const foundation = (
  overrides: Partial<FoundationSetOperation> = {},
): FoundationSetOperation => ({
  type: "foundation.set",
  operationId: "foundation-1",
  projectId: "project-1",
  sequence: 1,
  committedAt: "2026-07-28T12:00:00.000Z",
  foundation: unavailableFoundation,
  ...overrides,
});

export type ProjectRepositoryContractHarness = Readonly<{
  repository: ProjectRepository;
  setNow(isoTimestamp: string): void;
  corruptLatestSnapshot(projectId: string): Promise<void>;
  replaceLatestSnapshot(
    projectId: string,
    snapshot: Readonly<Record<string, unknown>>,
  ): Promise<void>;
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

    it("replays an erase and a hidden erase id from the journal", async () => {
      const initial = createDocument({
        projectId: "project-1",
        title: "Erase replay",
      });
      await harness.repository.createProject(initial);

      const paintedStroke = stroke();
      const eraseOperation: EraseOperation = {
        type: "erase.committed",
        operationId: "erase-1",
        projectId: "project-1",
        layerId: "paint-layer:project-1",
        sequence: 2,
        committedAt: "2026-07-21T10:02:00.000Z",
        eraser: {
          tipBrushId: "studio-pencil-v1",
          size: 40,
          opacity: 1,
          pressureSize: 1,
          pressureOpacity: 0,
          tiltShape: 0,
        },
        samples: paintedStroke.samples,
      };

      await harness.repository.appendOperation(paintedStroke);
      await harness.repository.appendOperation(eraseOperation);
      await harness.repository.appendOperation(
        visibility({
          operationId: "visibility-1",
          sequence: 3,
          targetOperationId: "erase-1",
          visible: false,
        }),
      );

      const reopened = await harness.repository.loadProject("project-1");

      expect(reopened.schemaVersion).toBe(3);
      expect(reopened.strokes.map((entry) => entry.operationId)).toEqual([
        paintedStroke.operationId,
      ]);
      expect(reopened.erases).toEqual([eraseOperation]);
      expect(reopened.hiddenStrokeIds).toEqual(["erase-1"]);
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

    it("round-trips a foundation whose asset is unavailable from the catalog", async () => {
      const initial = createDocument({
        projectId: "project-1",
        title: "Retired foundation",
      });
      const operation = foundation();
      const artwork = stroke({
        operationId: "stroke-with-foundation",
        sequence: 2,
      });
      const expected = {
        ...initial,
        operationSequence: 2,
        foundation: unavailableFoundation,
        strokes: [artwork],
      };
      await harness.repository.createProject(initial);
      await harness.repository.appendOperation(operation);
      await harness.repository.appendOperation(artwork);
      await harness.repository.writeSnapshot(expected);

      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toEqual(expected);
    });

    it("round-trips every calibrated brush with its complete texture snapshot", async () => {
      const initial = createDocument({
        projectId: "project-1",
        title: "Fabric swatches",
      });
      await harness.repository.createProject(initial);
      let expected = initial;

      for (const [index, preset] of BRUSH_PRESETS.entries()) {
        const operation = stroke({
          operationId: `stroke-${preset.id}`,
          sequence: index + 1,
          brush: getBrushPreset(preset.id),
        });
        await harness.repository.appendOperation(operation);
        expected = documentReducer(expected, operation);
      }
      await harness.repository.writeSnapshot(expected);

      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toEqual(expected);
    });

    it("reads a schema-v1 pencil snapshot without a texture object", async () => {
      const initial = createDocument({
        projectId: "project-1",
        title: "Legacy pencil",
      });
      const operation = stroke();
      const expected = documentReducer(initial, operation);
      const legacyBrush = {
        id: operation.brush.id,
        color: operation.brush.color,
        opacity: operation.brush.opacity,
        size: operation.brush.size,
        pressureSize: operation.brush.pressureSize,
        pressureOpacity: operation.brush.pressureOpacity,
        tiltShape: operation.brush.tiltShape,
      };
      await harness.repository.createProject(initial);
      await harness.repository.appendOperation(operation);
      await harness.repository.writeSnapshot(expected);
      const legacyExpected: Record<string, unknown> = structuredClone(expected);
      delete legacyExpected.foundation;
      await harness.replaceLatestSnapshot("project-1", {
        ...legacyExpected,
        schemaVersion: 1,
        strokes: [{ ...operation, brush: legacyBrush }],
      });

      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toEqual(expected);
    });

    it("falls back from a malformed foundation snapshot and replays the valid journal", async () => {
      const initial = createDocument({
        projectId: "project-1",
        title: "Foundation fallback",
      });
      const committed = documentReducer(initial, stroke());
      const foundationOperation = foundation({ sequence: 2 });
      const withFoundation = documentReducer(committed, foundationOperation);

      await harness.repository.createProject(initial);
      await harness.repository.appendOperation(stroke());
      await harness.repository.writeSnapshot(committed);
      await harness.repository.appendOperation(foundationOperation);
      await harness.repository.writeSnapshot(withFoundation);
      await harness.replaceLatestSnapshot("project-1", {
        ...withFoundation,
        foundation: {
          ...unavailableFoundation,
          transform: [0, 0, 0, 0, 0, 0, 0, 0, 1],
        },
      });

      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toEqual(withFoundation);
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

    it("falls back when the newest parseable snapshot contains a null stroke", async () => {
      const initial = createDocument({
        projectId: "project-1",
        title: "Null stroke fallback",
      });
      const committed = documentReducer(initial, stroke());
      const hidden = documentReducer(committed, visibility());

      await harness.repository.createProject(initial);
      await harness.repository.appendOperation(stroke());
      await harness.repository.writeSnapshot(committed);
      await harness.repository.appendOperation(visibility());
      await harness.repository.writeSnapshot(hidden);
      await harness.replaceLatestSnapshot("project-1", {
        ...hidden,
        strokes: [null],
      });

      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toEqual(hidden);
    });

    it("falls back when the newest parseable snapshot has a malformed nested sample", async () => {
      const initial = createDocument({
        projectId: "project-1",
        title: "Nested sample fallback",
      });
      const committed = documentReducer(initial, stroke());
      const hidden = documentReducer(committed, visibility());
      const malformedStroke = {
        ...stroke(),
        samples: [
          { ...stroke().samples[0], x: "not-a-number" },
          stroke().samples[1],
        ],
      };

      await harness.repository.createProject(initial);
      await harness.repository.appendOperation(stroke());
      await harness.repository.writeSnapshot(committed);
      await harness.repository.appendOperation(visibility());
      await harness.repository.writeSnapshot(hidden);
      await harness.replaceLatestSnapshot("project-1", {
        ...hidden,
        strokes: [malformedStroke],
      });

      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toEqual(hidden);
    });

    it("falls back when the newest snapshot sequence exceeds durable history", async () => {
      const initial = createDocument({
        projectId: "project-1",
        title: "Future sequence fallback",
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
      await harness.replaceLatestSnapshot("project-1", {
        ...hidden,
        operationSequence: 999,
      });

      await expect(
        harness.repository.loadProject("project-1"),
      ).resolves.toEqual(visible);
    });

    it("falls back when replay after the newest valid snapshot is semantically inconsistent", async () => {
      const initial = createDocument({
        projectId: "project-1",
        title: "Replay fallback",
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
      await harness.replaceLatestSnapshot("project-1", {
        ...hidden,
        strokes: [stroke({ operationId: "other-stroke" })],
        hiddenStrokeIds: [],
      });

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
