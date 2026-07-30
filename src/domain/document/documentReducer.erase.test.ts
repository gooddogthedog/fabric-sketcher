import { describe, expect, it } from "vitest";
import { getBrushPreset } from "../../engine/brush/presets";
import { createDocument } from "./createDocument";
import {
  DocumentStrokeError,
  DocumentVisibilityError,
  documentReducer,
} from "./documentReducer";
import type {
  EraseOperation,
  PenSample,
  StrokeOperation,
  StrokeVisibilityOperation,
} from "./types";

const samples: readonly PenSample[] = [
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

const stroke = (sequence: number): StrokeOperation => ({
  type: "stroke.committed",
  operationId: `stroke-${sequence}`,
  projectId: "project",
  layerId: "paint-layer:project",
  sequence,
  committedAt: "2026-07-29T00:00:00.000Z",
  brush: getBrushPreset("studio-pencil-v1"),
  samples,
});

const erase = (
  sequence: number,
  overrides: Partial<EraseOperation> = {},
): EraseOperation => ({
  type: "erase.committed",
  operationId: `erase-${sequence}`,
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
  samples,
  ...overrides,
});

const visibility = (
  sequence: number,
  targetOperationId: string,
  visible: boolean,
): StrokeVisibilityOperation => ({
  type: "stroke.visibility-set",
  operationId: `visibility-${sequence}`,
  projectId: "project",
  sequence,
  committedAt: "2026-07-29T00:00:00.000Z",
  targetOperationId,
  visible,
});

function documentWithStroke() {
  return documentReducer(
    createDocument({ projectId: "project", title: "Erase" }),
    stroke(1),
  );
}

describe("documentReducer erase handling", () => {
  it("appends an erase without touching stored stroke samples", () => {
    const base = documentWithStroke();
    const originalSamples = base.strokes[0]!.samples;

    const erased = documentReducer(base, erase(2));

    expect(erased.schemaVersion).toBe(3);
    expect(erased.erases).toHaveLength(1);
    expect(erased.strokes).toHaveLength(1);
    expect(erased.strokes[0]!.samples).toEqual(originalSamples);
    expect(erased.hiddenStrokeIds).toEqual([]);
    expect(erased.operationSequence).toBe(2);
  });

  it("hides and reshows an erase through the visibility operation", () => {
    const withErase = documentReducer(documentWithStroke(), erase(2));

    const hidden = documentReducer(withErase, visibility(3, "erase-2", false));
    expect(hidden.hiddenStrokeIds).toEqual(["erase-2"]);

    const shown = documentReducer(hidden, visibility(4, "erase-2", true));
    expect(shown.hiddenStrokeIds).toEqual([]);
  });

  it("still rejects a visibility operation for an unknown mark", () => {
    expect(() =>
      documentReducer(documentWithStroke(), visibility(2, "ghost", false)),
    ).toThrow(DocumentVisibilityError);
  });

  it("rejects an erase with fewer than two samples", () => {
    expect(() =>
      documentReducer(
        documentWithStroke(),
        erase(2, { samples: [samples[0]!] }),
      ),
    ).toThrow(DocumentStrokeError);
  });

  it("treats a replayed erase as idempotent", () => {
    const base = documentReducer(documentWithStroke(), erase(2));

    expect(documentReducer(base, erase(2))).toBe(base);
  });
});
