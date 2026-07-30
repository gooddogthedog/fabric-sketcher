import { describe, expect, it } from "vitest";
import { getBrushPreset } from "../../engine/brush/presets";
import { createDocument } from "./createDocument";
import {
  findMark,
  lastVisibleMark,
  orderedMarks,
  orderedVisibleMarks,
} from "./documentMarks";
import type {
  DesignDocument,
  EraseOperation,
  PenSample,
  StrokeOperation,
} from "./types";

const markSamples: readonly PenSample[] = [
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
];

function markStroke(operationId: string, sequence: number): StrokeOperation {
  return {
    type: "stroke.committed",
    operationId,
    projectId: "project",
    layerId: "paint-layer:project",
    sequence,
    committedAt: "2026-07-29T00:00:00.000Z",
    brush: getBrushPreset("studio-pencil-v1"),
    samples: markSamples,
  };
}

function markErase(operationId: string, sequence: number): EraseOperation {
  return {
    type: "erase.committed",
    operationId,
    projectId: "project",
    layerId: "paint-layer:project",
    sequence,
    committedAt: "2026-07-29T00:00:00.000Z",
    eraser: {
      tipBrushId: "studio-pencil-v1",
      size: 40,
      opacity: 1,
      pressureSize: 1,
      pressureOpacity: 0,
      tiltShape: 0,
    },
    samples: markSamples,
  };
}

function documentWith(
  strokes: readonly StrokeOperation[],
  erases: readonly EraseOperation[],
  hiddenStrokeIds: readonly string[] = [],
): DesignDocument {
  return {
    ...createDocument({ projectId: "project", title: "Marks" }),
    operationSequence: 10,
    strokes,
    erases,
    hiddenStrokeIds,
  };
}

describe("documentMarks", () => {
  it("interleaves strokes and erases in commit order", () => {
    const document = documentWith(
      [markStroke("s1", 1), markStroke("s2", 3)],
      [markErase("e1", 2), markErase("e2", 4)],
    );

    expect(orderedMarks(document).map((mark) => mark.operationId)).toEqual([
      "s1",
      "e1",
      "s2",
      "e2",
    ]);
  });

  it("omits hidden marks of either kind", () => {
    const document = documentWith(
      [markStroke("s1", 1), markStroke("s2", 3)],
      [markErase("e1", 2)],
      ["s2", "e1"],
    );

    expect(
      orderedVisibleMarks(document).map((mark) => mark.operationId),
    ).toEqual(["s1"]);
  });

  it("reports the newest visible mark and finds marks by id", () => {
    const document = documentWith(
      [markStroke("s1", 1)],
      [markErase("e1", 2), markErase("e2", 5)],
      ["e2"],
    );

    expect(lastVisibleMark(document)?.operationId).toBe("e1");
    expect(findMark(document, "e2")?.type).toBe("erase.committed");
    expect(findMark(document, "missing")).toBeNull();
  });

  it("reports no visible mark for an empty or fully hidden document", () => {
    expect(lastVisibleMark(documentWith([], []))).toBeNull();
    expect(
      lastVisibleMark(documentWith([markStroke("s1", 1)], [], ["s1"])),
    ).toBeNull();
  });

  it("does not mutate the document's own stroke or erase arrays", () => {
    const strokes = [markStroke("s2", 3), markStroke("s1", 1)];
    const document = documentWith(strokes, []);

    orderedMarks(document);

    expect(strokes.map((stroke) => stroke.operationId)).toEqual(["s2", "s1"]);
  });
});
