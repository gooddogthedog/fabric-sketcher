import { describe, expect, it } from "vitest";
import { createDocument } from "./createDocument";

describe("createDocument", () => {
  it("creates an A4 portrait document with the warm-paper defaults", () => {
    const document = createDocument({
      projectId: "project-123",
      title: "Untitled sketch",
    });

    expect(document).toEqual({
      schemaVersion: 1,
      projectId: "project-123",
      title: "Untitled sketch",
      width: 2480,
      height: 3508,
      background: "#F7F3EC",
      activeLayerId: "paint-layer:project-123",
      operationSequence: 0,
      strokes: [],
      hiddenStrokeIds: [],
    });
  });
});
