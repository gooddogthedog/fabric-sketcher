import { describe, expect, it } from "vitest";
import { createDocument } from "./createDocument";
import {
  DocumentSequenceError,
  DocumentStrokeError,
  DocumentVisibilityError,
  documentReducer,
} from "./documentReducer";
import type {
  FoundationSetOperation,
  FoundationState,
  StrokeOperation,
  StrokeVisibilityOperation,
} from "./types";

const figure: FoundationState = {
  assetId: "neutral-figure-front",
  assetVersion: 1,
  foundationType: "figure",
  transform: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  opacity: 0.34,
  visible: true,
  visibleLandmarkGroups: ["outline", "center", "levels"],
  locked: true,
  includeInExport: false,
};

const dressForm: FoundationState = {
  assetId: "dress-form-front",
  assetVersion: 1,
  foundationType: "dress-form",
  transform: [0.9, 0, 24, 0, 0.9, 36, 0, 0, 1],
  opacity: 0.4,
  visible: true,
  visibleLandmarkGroups: ["outline", "center", "construction"],
  locked: false,
  includeInExport: true,
};

const foundationOperation = (
  foundation: FoundationState | null,
  overrides: Partial<FoundationSetOperation> = {},
): FoundationSetOperation => ({
  type: "foundation.set",
  operationId: "foundation-1",
  projectId: "project-123",
  sequence: 1,
  committedAt: "2026-07-28T12:00:00.000Z",
  foundation,
  ...overrides,
});

const stroke = (overrides: Partial<StrokeOperation> = {}): StrokeOperation => ({
  type: "stroke.committed",
  operationId: "stroke-1",
  projectId: "project-123",
  layerId: "paint-layer:project-123",
  sequence: 1,
  committedAt: "2026-07-20T12:00:00.000Z",
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

const visibility = (
  overrides: Partial<StrokeVisibilityOperation> = {},
): StrokeVisibilityOperation => ({
  type: "stroke.visibility-set",
  operationId: "visibility-1",
  projectId: "project-123",
  sequence: 2,
  committedAt: "2026-07-20T12:01:00.000Z",
  targetOperationId: "stroke-1",
  visible: false,
  ...overrides,
});

describe("documentReducer", () => {
  it("applies a durable document rename", () => {
    const renamed = documentReducer(
      createDocument({ projectId: "project-123", title: "Untitled Design" }),
      {
        type: "document.title-set",
        operationId: "rename-1",
        projectId: "project-123",
        sequence: 1,
        committedAt: "2026-07-29T12:00:00.000Z",
        title: "Linen Wrap Study",
      },
    );

    expect(renamed.title).toBe("Linen Wrap Study");
    expect(renamed.operationSequence).toBe(1);
  });

  it("applies and replaces a complete foundation snapshot", () => {
    const document = createDocument({
      projectId: "project-123",
      title: "Foundation study",
    });
    const withFigure = documentReducer(document, foundationOperation(figure));
    const withForm = documentReducer(
      withFigure,
      foundationOperation(dressForm, {
        sequence: 2,
        operationId: "foundation-2",
      }),
    );

    expect(withForm.foundation).toEqual(dressForm);
    expect(withForm.operationSequence).toBe(2);
    expect(withForm.foundation).not.toBe(dressForm);
    expect(Object.isFrozen(withForm.foundation)).toBe(true);
  });

  it("removes a foundation without changing strokes", () => {
    const withStroke = documentReducer(
      createDocument({
        projectId: "project-123",
        title: "Foundation study",
      }),
      stroke(),
    );
    const documentWithStrokeAndFoundation = documentReducer(
      withStroke,
      foundationOperation(figure, {
        sequence: 2,
        operationId: "foundation-1",
      }),
    );

    const result = documentReducer(documentWithStrokeAndFoundation, {
      ...foundationOperation(null),
      sequence: 3,
      operationId: "foundation-2",
    });

    expect(result.foundation).toBeNull();
    expect(result.strokes).toEqual(documentWithStrokeAndFoundation.strokes);
  });

  it("commits a stroke immutably and advances the operation sequence once", () => {
    const document = createDocument({
      projectId: "project-123",
      title: "Untitled sketch",
    });
    const operation = stroke();

    const nextDocument = documentReducer(document, operation);

    expect(nextDocument).not.toBe(document);
    expect(nextDocument.strokes).toEqual([operation]);
    expect(nextDocument.operationSequence).toBe(1);
    expect(document.strokes).toEqual([]);
    expect(document.operationSequence).toBe(0);
  });

  it("normalizes a legacy schema-v1 pencil journal operation", () => {
    const operation = stroke();
    const legacyBrush = {
      id: operation.brush.id,
      color: operation.brush.color,
      opacity: operation.brush.opacity,
      size: operation.brush.size,
      pressureSize: operation.brush.pressureSize,
      pressureOpacity: operation.brush.pressureOpacity,
      tiltShape: operation.brush.tiltShape,
    };

    const document = documentReducer(
      createDocument({ projectId: "project-123", title: "Legacy pencil" }),
      { ...operation, brush: legacyBrush as StrokeOperation["brush"] },
    );

    expect(document.strokes[0]?.brush.texture).toEqual({
      kind: "graphite",
      scale: 18,
      strength: 0.34,
      angle: 0,
      scatter: 0.18,
    });
  });

  it("is idempotent when replaying a duplicate operation ID", () => {
    const document = createDocument({
      projectId: "project-123",
      title: "Untitled sketch",
    });
    const committedDocument = documentReducer(document, stroke());

    const replayedDocument = documentReducer(
      committedDocument,
      stroke({ sequence: 99 }),
    );

    expect(replayedDocument).toBe(committedDocument);
  });

  it("rejects a sequence gap without changing document history", () => {
    const document = createDocument({
      projectId: "project-123",
      title: "Untitled sketch",
    });

    expect(() => documentReducer(document, stroke({ sequence: 2 }))).toThrow(
      DocumentSequenceError,
    );
    expect(document).toEqual(
      createDocument({
        projectId: "project-123",
        title: "Untitled sketch",
      }),
    );
  });

  it("rejects an empty stroke", () => {
    const document = createDocument({
      projectId: "project-123",
      title: "Untitled sketch",
    });

    expect(() => documentReducer(document, stroke({ samples: [] }))).toThrow(
      DocumentStrokeError,
    );
  });

  it("rejects a single-sample stroke", () => {
    const document = createDocument({
      projectId: "project-123",
      title: "Untitled sketch",
    });

    expect(() =>
      documentReducer(
        document,
        stroke({ samples: stroke().samples.slice(0, 1) }),
      ),
    ).toThrow(DocumentStrokeError);
  });

  it("hides a target stroke without deleting it", () => {
    const document = documentReducer(
      createDocument({ projectId: "project-123", title: "Untitled sketch" }),
      stroke(),
    );

    const hiddenDocument = documentReducer(document, visibility());

    expect(hiddenDocument.strokes).toEqual([stroke()]);
    expect(hiddenDocument.hiddenStrokeIds).toEqual(["stroke-1"]);
    expect(hiddenDocument.operationSequence).toBe(2);
  });

  it("restores a hidden target stroke without deleting it", () => {
    const document = documentReducer(
      documentReducer(
        createDocument({ projectId: "project-123", title: "Untitled sketch" }),
        stroke(),
      ),
      visibility(),
    );

    const restoredDocument = documentReducer(
      document,
      visibility({
        operationId: "visibility-2",
        sequence: 3,
        visible: true,
      }),
    );

    expect(restoredDocument.strokes).toEqual([stroke()]);
    expect(restoredDocument.hiddenStrokeIds).toEqual([]);
    expect(restoredDocument.operationSequence).toBe(3);
  });

  it("keeps hidden stroke IDs canonical for distinct repeated visibility operations", () => {
    const committedDocument = documentReducer(
      createDocument({ projectId: "project-123", title: "Untitled sketch" }),
      stroke(),
    );
    const hiddenDocument = documentReducer(committedDocument, visibility());
    const stillHiddenDocument = documentReducer(
      hiddenDocument,
      visibility({ operationId: "visibility-2", sequence: 3 }),
    );

    expect(stillHiddenDocument.hiddenStrokeIds).toEqual(["stroke-1"]);
    expect(stillHiddenDocument.operationSequence).toBe(3);

    const visibleDocument = documentReducer(
      stillHiddenDocument,
      visibility({
        operationId: "visibility-3",
        sequence: 4,
        visible: true,
      }),
    );
    const stillVisibleDocument = documentReducer(
      visibleDocument,
      visibility({
        operationId: "visibility-4",
        sequence: 5,
        visible: true,
      }),
    );

    expect(stillVisibleDocument.hiddenStrokeIds).toEqual([]);
    expect(stillVisibleDocument.operationSequence).toBe(5);
  });

  it("rejects a visibility operation for an unknown stroke", () => {
    const document = createDocument({
      projectId: "project-123",
      title: "Untitled sketch",
    });

    expect(() =>
      documentReducer(
        document,
        visibility({ targetOperationId: "missing-stroke", sequence: 1 }),
      ),
    ).toThrow(DocumentVisibilityError);
  });
});
