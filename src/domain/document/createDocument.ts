import type { DesignDocument } from "./types";

export type CreateDocumentParameters = Readonly<{
  projectId: string;
  title: string;
}>;

export function createDocument({
  projectId,
  title,
}: CreateDocumentParameters): DesignDocument {
  return {
    schemaVersion: 1,
    projectId,
    title,
    width: 2480,
    height: 3508,
    background: "#F7F3EC",
    activeLayerId: `paint-layer:${projectId}`,
    operationSequence: 0,
    strokes: [],
    hiddenStrokeIds: [],
  };
}
