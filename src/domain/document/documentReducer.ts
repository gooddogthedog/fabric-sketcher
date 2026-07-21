import type { DesignDocument, DocumentOperation } from "./types";

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
        : [...document.hiddenStrokeIds, operation.targetOperationId],
    };
  }

  if (operation.samples.length < 2) {
    throw new DocumentStrokeError(operation.samples.length);
  }

  return {
    ...document,
    operationSequence: document.operationSequence + 1,
    strokes: [...document.strokes, operation],
  };
}
