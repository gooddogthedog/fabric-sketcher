import { describe, expect, it, vi } from "vitest";
import type { PenSample } from "../../domain/document/types";
import { StrokeSession } from "./StrokeSession";
import type { InputBatch } from "./types";

function sample(x: number): PenSample {
  return {
    x,
    y: 0,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    altitudeAngle: null,
    azimuthAngle: null,
    time: x,
  };
}

function batch(values: Partial<InputBatch> = {}): InputBatch {
  return {
    pointerId: 1,
    pointerType: "pen",
    phase: "down",
    confirmed: [sample(1)],
    predicted: [],
    ...values,
  };
}

describe("StrokeSession", () => {
  it("begins one drawing session from a pen down", () => {
    const onPreview = vi.fn();
    const session = new StrokeSession({
      onPreview,
      onCommit: vi.fn(),
      onCancel: vi.fn(),
    });

    session.handle(batch());
    session.handle(batch({ confirmed: [sample(2)] }));

    expect(session.state).toEqual({
      kind: "drawing",
      pointerId: 1,
      confirmed: [sample(1)],
      predicted: [],
    });
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it.each(["touch", "mouse"] as const)(
    "does not start a paint session from %s input",
    (pointerType) => {
      const session = new StrokeSession({
        onPreview: vi.fn(),
        onCommit: vi.fn(),
        onCancel: vi.fn(),
      });

      session.handle(batch({ pointerType }));

      expect(session.state).toEqual({ kind: "idle" });
    },
  );

  it("replaces the predicted tail when new confirmed samples arrive", () => {
    const onPreview = vi.fn();
    const session = new StrokeSession({
      onPreview,
      onCommit: vi.fn(),
      onCancel: vi.fn(),
    });

    session.handle(batch({ predicted: [sample(2)] }));
    session.handle(
      batch({ phase: "move", confirmed: [sample(3)], predicted: [sample(4)] }),
    );

    expect(onPreview).toHaveBeenLastCalledWith(
      [sample(1), sample(3)],
      [sample(4)],
    );
  });

  it("commits one immutable confirmed stroke on up", () => {
    const onCommit = vi.fn();
    const session = new StrokeSession({
      onPreview: vi.fn(),
      onCommit,
      onCancel: vi.fn(),
    });

    session.handle(batch({ predicted: [sample(2)] }));
    session.handle(batch({ phase: "up", confirmed: [sample(3)] }));

    const committed = onCommit.mock.calls[0]?.[0];
    expect(committed).toEqual([sample(1), sample(3)]);
    expect(Object.isFrozen(committed)).toBe(true);
    expect(session.state).toEqual({ kind: "idle" });
  });

  it("discards a stroke on cancel", () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    const session = new StrokeSession({ onPreview, onCommit, onCancel });

    session.handle(batch());
    session.handle(batch({ phase: "cancel" }));

    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onPreview).toHaveBeenLastCalledWith([], []);
    expect(session.state).toEqual({ kind: "idle" });
  });

  it("treats lost capture as cancel for its active pointer", () => {
    const onPreview = vi.fn();
    const onCancel = vi.fn();
    const session = new StrokeSession({
      onPreview,
      onCommit: vi.fn(),
      onCancel,
    });

    session.handle(batch());
    session.lostPointerCapture(1);

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onPreview).toHaveBeenLastCalledWith([], []);
    expect(session.state).toEqual({ kind: "idle" });
  });

  it("starts a new contact while the prior commit is pending", () => {
    let resolveCommit: (() => void) | undefined;
    const session = new StrokeSession({
      onPreview: vi.fn(),
      onCommit: () =>
        new Promise<void>((resolve) => {
          resolveCommit = resolve;
        }),
      onCancel: vi.fn(),
    });

    session.handle(batch());
    session.handle(batch({ phase: "up" }));
    session.handle(batch({ pointerId: 2, confirmed: [sample(2)] }));

    expect(session.state).toEqual({
      kind: "drawing",
      pointerId: 2,
      confirmed: [sample(2)],
      predicted: [],
    });
    resolveCommit?.();
  });

  it("contains a rejected durability promise", async () => {
    const session = new StrokeSession({
      onPreview: vi.fn(),
      onCommit: () => Promise.reject(new Error("storage unavailable")),
      onCancel: vi.fn(),
    });

    session.handle(batch());
    session.handle(batch({ phase: "up" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(session.state).toEqual({ kind: "idle" });
  });

  it("ignores movement from a different pointer", () => {
    const onPreview = vi.fn();
    const session = new StrokeSession({
      onPreview,
      onCommit: vi.fn(),
      onCancel: vi.fn(),
    });

    session.handle(batch());
    session.handle(
      batch({ pointerId: 2, phase: "move", confirmed: [sample(2)] }),
    );

    expect(session.state).toEqual({
      kind: "drawing",
      pointerId: 1,
      confirmed: [sample(1)],
      predicted: [],
    });
    expect(onPreview).toHaveBeenCalledOnce();
  });

  it("previews the final confirmed stroke without a predicted tail", () => {
    const onPreview = vi.fn();
    const session = new StrokeSession({
      onPreview,
      onCommit: vi.fn(),
      onCancel: vi.fn(),
    });

    session.handle(batch({ predicted: [sample(2)] }));
    session.handle(batch({ phase: "up", confirmed: [sample(3)] }));

    expect(onPreview).toHaveBeenLastCalledWith([sample(1), sample(3)], []);
  });

  it("ignores a duplicate up event", () => {
    const onCommit = vi.fn();
    const session = new StrokeSession({
      onPreview: vi.fn(),
      onCommit,
      onCancel: vi.fn(),
    });

    session.handle(batch());
    session.handle(batch({ phase: "up" }));
    session.handle(batch({ phase: "up" }));

    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("ignores lost capture after a matching up", () => {
    const onCancel = vi.fn();
    const session = new StrokeSession({
      onPreview: vi.fn(),
      onCommit: vi.fn(),
      onCancel,
    });

    session.handle(batch());
    session.handle(batch({ phase: "up" }));
    session.lostPointerCapture(1);

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("replaces rather than mutates prior confirmed and predicted arrays", () => {
    const session = new StrokeSession({
      onPreview: vi.fn(),
      onCommit: vi.fn(),
      onCancel: vi.fn(),
    });

    session.handle(batch({ predicted: [sample(2)] }));
    const prior = session.state;
    session.handle(
      batch({ phase: "move", confirmed: [sample(3)], predicted: [sample(4)] }),
    );

    expect(prior).toEqual({
      kind: "drawing",
      pointerId: 1,
      confirmed: [sample(1)],
      predicted: [sample(2)],
    });
    expect(session.state).not.toBe(prior);
  });
});
