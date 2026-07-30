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
      schemaVersion: 3,
      projectId: "project-123",
      title: "Untitled sketch",
      width: 2480,
      height: 3508,
      background: "#F7F3EC",
      activeLayerId: "paint-layer:project-123",
      operationSequence: 0,
      foundation: null,
      strokes: [],
      erases: [],
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

  const eraseFixture = {
    type: "erase.committed",
    operationId: "erase-1",
    projectId: "project-1",
    layerId: "paint-layer:project-1",
    sequence: 1,
    committedAt: "2026-07-29T00:00:00.000Z",
    eraser: {
      tipBrushId: "studio-pencil-v1",
      size: 40,
      opacity: 1,
      pressureSize: 1,
      pressureOpacity: 0,
      tiltShape: 0,
    },
    samples: [
      {
        x: 0,
        y: 0,
        pressure: 0.5,
        tiltX: 0,
        tiltY: 0,
        twist: 0,
        altitudeAngle: null,
        azimuthAngle: null,
        time: 0,
      },
      {
        x: 10,
        y: 10,
        pressure: 0.5,
        tiltX: 0,
        tiltY: 0,
        twist: 0,
        altitudeAngle: null,
        azimuthAngle: null,
        time: 10,
      },
    ],
  };

  it("migrates a schema-v1 project without a foundation", () => {
    const result = normalizeDesignDocument(schemaV1Fixture, "project-1");

    expect(result).toMatchObject({ schemaVersion: 3, foundation: null });
  });

  it("gives schema-v1 and schema-v2 projects an empty erase list", () => {
    expect(
      normalizeDesignDocument(schemaV1Fixture, "project-1").erases,
    ).toEqual([]);
    expect(
      normalizeDesignDocument(
        { ...schemaV1Fixture, schemaVersion: 2, foundation: null },
        "project-1",
      ).erases,
    ).toEqual([]);
  });

  it("retains schema-v3 erases and lets a hidden id name one", () => {
    const result = normalizeDesignDocument(
      {
        ...schemaV1Fixture,
        schemaVersion: 3,
        foundation: null,
        operationSequence: 1,
        erases: [eraseFixture],
        hiddenStrokeIds: ["erase-1"],
      },
      "project-1",
    );

    expect(result.schemaVersion).toBe(3);
    expect(result.erases).toHaveLength(1);
    expect(result.erases[0]!.eraser.tipBrushId).toBe("studio-pencil-v1");
    expect(result.hiddenStrokeIds).toEqual(["erase-1"]);
  });

  it("rejects a schema-v3 snapshot whose erases are not an array", () => {
    expect(() =>
      normalizeDesignDocument(
        { ...schemaV1Fixture, schemaVersion: 3, foundation: null, erases: {} },
        "project-1",
      ),
    ).toThrow("Invalid snapshot for project project-1.");
  });

  it("rejects a hidden id that names neither a stroke nor an erase", () => {
    expect(() =>
      normalizeDesignDocument(
        {
          ...schemaV1Fixture,
          schemaVersion: 3,
          foundation: null,
          erases: [],
          hiddenStrokeIds: ["ghost"],
        },
        "project-1",
      ),
    ).toThrow("Invalid snapshot for project project-1.");
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
