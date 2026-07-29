import type {
  DesignDocument,
  DocumentOperation,
  StrokeOperation,
} from "./types";
import { immutableFoundation } from "./foundationState";

export class DocumentSequenceError extends Error {
  constructor(expected: number, received: number) {
    super(`Expected operation sequence ${expected}, received ${received}.`);
    this.name = "DocumentSequenceError";
  }
}

export class DocumentStrokeError extends Error {
  constructor(sampleCount: number) {
    super(
      `A committed stroke requires at least two samples, received ${sampleCount}.`,
    );
    this.name = "DocumentStrokeError";
  }
}

export class DocumentVisibilityError extends Error {
  constructor(targetOperationId: string) {
    super(`Cannot set visibility for unknown stroke ${targetOperationId}.`);
    this.name = "DocumentVisibilityError";
  }
}

/**
 * Replays durable document state. Committed stroke IDs remain in `strokes`, so
 * duplicate committed strokes are idempotent here. Visibility-operation IDs
 * are intentionally not retained by `DesignDocument`; the operation journal's
 * unique `operationId` index enforces general append idempotence.
 */
export function documentReducer(
  document: DesignDocument,
  operation: DocumentOperation,
): DesignDocument {
  if (
    document.strokes.some(
      (stroke) => stroke.operationId === operation.operationId,
    )
  ) {
    return document;
  }

  const expectedSequence = document.operationSequence + 1;
  if (operation.sequence !== expectedSequence) {
    throw new DocumentSequenceError(expectedSequence, operation.sequence);
  }

  if (operation.type === "foundation.set") {
    return {
      ...document,
      operationSequence: operation.sequence,
      foundation: immutableFoundation(operation.foundation),
    };
  }

  if (operation.type === "document.title-set") {
    return {
      ...document,
      operationSequence: operation.sequence,
      title: operation.title,
    };
  }

  if (operation.type === "stroke.visibility-set") {
    const targetExists = document.strokes.some(
      (stroke) => stroke.operationId === operation.targetOperationId,
    );
    if (!targetExists) {
      throw new DocumentVisibilityError(operation.targetOperationId);
    }

    return {
      ...document,
      operationSequence: operation.sequence,
      hiddenStrokeIds: operation.visible
        ? document.hiddenStrokeIds.filter(
            (operationId) => operationId !== operation.targetOperationId,
          )
        : document.hiddenStrokeIds.includes(operation.targetOperationId)
          ? document.hiddenStrokeIds
          : [...document.hiddenStrokeIds, operation.targetOperationId],
    };
  }

  if (operation.samples.length < 2) {
    throw new DocumentStrokeError(operation.samples.length);
  }
  const stroke = normalizeLegacyPencilStroke(operation);

  return {
    ...document,
    operationSequence: document.operationSequence + 1,
    strokes: [...document.strokes, stroke],
  };
}

function normalizeLegacyPencilStroke(
  operation: StrokeOperation,
): StrokeOperation {
  if (
    operation.brush.id !== "studio-pencil-v1" ||
    operation.brush.texture !== undefined
  ) {
    return operation;
  }
  return {
    ...operation,
    brush: {
      ...operation.brush,
      texture: {
        kind: "graphite",
        scale: 18,
        strength: 0.34,
        angle: 0,
        scatter: 0.18,
      },
    },
  };
}
