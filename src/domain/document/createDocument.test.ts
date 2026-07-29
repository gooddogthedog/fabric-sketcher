import { describe, expect, it } from "vitest";
import { normalizeDesignDocument } from "../../platform/persistence/types";
import { createDocument } from "./createDocument";

describe("createDocument", () => {
  it("creates an A4 portrait document with the warm-paper defaults", () => {
    const document = createDocument({
      projectId: "project-123",
      title: "Untitled sketch",
    });

    expect(document).toEqual({
      schemaVersion: 2,
      projectId: "project-123",
      title: "Untitled sketch",
      width: 2480,
      height: 3508,
      background: "#F7F3EC",
      activeLayerId: "paint-layer:project-123",
      operationSequence: 0,
      foundation: null,
      strokes: [],
      hiddenStrokeIds: [],
    });
  });
});

describe("normalizeDesignDocument", () => {
  const schemaV1Fixture = {
    schemaVersion: 1,
    projectId: "project-1",
    title: "Legacy sketch",
    width: 2480,
    height: 3508,
    background: "#F7F3EC",
    activeLayerId: "paint-layer:project-1",
    operationSequence: 0,
    strokes: [],
    hiddenStrokeIds: [],
  };

  it("migrates a schema-v1 project without a foundation", () => {
    const result = normalizeDesignDocument(schemaV1Fixture, "project-1");

    expect(result).toMatchObject({ schemaVersion: 2, foundation: null });
  });

  it("retains an unavailable but valid foundation asset reference", () => {
    const result = normalizeDesignDocument(
      {
        ...schemaV1Fixture,
        schemaVersion: 2,
        foundation: {
          assetId: "retired-foundation",
          assetVersion: 7,
          foundationType: "figure",
          transform: [1, 0, 36, 0, 1, 48, 0, 0, 1],
          opacity: 0.34,
          visible: true,
          visibleLandmarkGroups: ["outline", "center", "levels"],
          locked: true,
          includeInExport: false,
        },
      },
      "project-1",
    );

    expect(result.foundation?.assetId).toBe("retired-foundation");
  });

  it("rejects a malformed schema-v2 foundation", () => {
    expect(() =>
      normalizeDesignDocument(
        {
          ...schemaV1Fixture,
          schemaVersion: 2,
          foundation: {
            assetId: "retired-foundation",
            assetVersion: 7,
            foundationType: "figure",
            transform: [0, 0, 0, 0, 0, 0, 0, 0, 1],
            opacity: 0.34,
            visible: true,
            visibleLandmarkGroups: ["outline"],
            locked: true,
            includeInExport: false,
          },
        },
        "project-1",
      ),
    ).toThrow("Invalid foundation state.");
  });
});
