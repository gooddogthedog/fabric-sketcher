import type { DesignDocument, DocumentMark } from "./types";

/**
 * Strokes and erases interleaved in commit order. Both renderers composite
 * marks in the order they receive them, so an erase must sit between the
 * strokes it was drawn over and any stroke committed after it.
 */
export function orderedMarks(
  document: DesignDocument,
): readonly DocumentMark[] {
  return Object.freeze(
    [...document.strokes, ...document.erases].sort(
      (left, right) => left.sequence - right.sequence,
    ),
  );
}

export function orderedVisibleMarks(
  document: DesignDocument,
): readonly DocumentMark[] {
  return Object.freeze(
    orderedMarks(document).filter(
      (mark) => !document.hiddenStrokeIds.includes(mark.operationId),
    ),
  );
}

export function lastVisibleMark(document: DesignDocument): DocumentMark | null {
  return orderedVisibleMarks(document).at(-1) ?? null;
}

export function findMark(
  document: DesignDocument,
  operationId: string,
): DocumentMark | null {
  return (
    orderedMarks(document).find((mark) => mark.operationId === operationId) ??
    null
  );
}
