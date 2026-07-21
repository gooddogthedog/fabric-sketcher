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
    expect(onCommit).toHaveBeenCalledOnce();
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
    session.handle(batch({ pointerId: 1, confirmed: [sample(2)] }));

    expect(session.state).toEqual({
      kind: "drawing",
      pointerId: 1,
      confirmed: [sample(2)],
      predicted: [],
    });
    resolveCommit?.();
  });

  it("contains a rejected durability promise", async () => {
    const error = new Error("storage unavailable");
    const onCommitError = vi.fn();
    const session = new StrokeSession({
      onPreview: vi.fn(),
      onCommit: () => Promise.reject(error),
      onCancel: vi.fn(),
      onCommitError,
    });

    session.handle(batch());
    session.handle(batch({ phase: "up" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(session.state).toEqual({ kind: "idle" });
    expect(onCommitError).toHaveBeenCalledWith(error);
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

  it("clears both preview channels after committing the final stroke", () => {
    const onPreview = vi.fn();
    const session = new StrokeSession({
      onPreview,
      onCommit: vi.fn(),
      onCancel: vi.fn(),
    });

    session.handle(batch({ predicted: [sample(2)] }));
    session.handle(batch({ phase: "up", confirmed: [sample(3)] }));

    expect(onPreview).toHaveBeenLastCalledWith([], []);
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

  it("isolates active state from later mutation of an input sample", () => {
    const input = sample(1);
    const session = new StrokeSession({
      onPreview: vi.fn(),
      onCommit: vi.fn(),
      onCancel: vi.fn(),
    });

    session.handle(batch({ confirmed: [input] }));
    (input as { x: number }).x = 999;

    expect(session.state).toMatchObject({
      kind: "drawing",
      confirmed: [sample(1)],
    });
  });

  it("isolates committed samples from later mutation of an up input sample", () => {
    const finalInput = sample(3);
    const onCommit = vi.fn();
    const session = new StrokeSession({
      onPreview: vi.fn(),
      onCommit,
      onCancel: vi.fn(),
    });

    session.handle(batch());
    session.handle(batch({ phase: "up", confirmed: [finalInput] }));
    (finalInput as { x: number }).x = 999;

    expect(onCommit).toHaveBeenCalledWith([sample(1), sample(3)]);
  });

  it("isolates active and committed samples from preview callback mutation", () => {
    const onCommit = vi.fn();
    const session = new StrokeSession({
      onPreview: (confirmed) => {
        const first = confirmed[0];
        if (first == null) {
          return;
        }

        try {
          (first as { x: number }).x = 999;
        } catch {
          // Frozen callback values are expected to reject this mutation.
        }
      },
      onCommit,
      onCancel: vi.fn(),
    });

    session.handle(batch());

    expect(session.state).toMatchObject({
      kind: "drawing",
      confirmed: [sample(1)],
    });

    session.handle(batch({ phase: "up" }));

    expect(onCommit).toHaveBeenCalledWith([sample(1), sample(1)]);
    expect(Object.isFrozen(onCommit.mock.calls[0]?.[0][0])).toBe(true);
  });

  it("reports a synchronous commit failure after clearing the session", () => {
    const error = new Error("storage unavailable");
    const onPreview = vi.fn();
    const onCommitError = vi.fn();
    const session = new StrokeSession({
      onPreview,
      onCommit: () => {
        throw error;
      },
      onCancel: vi.fn(),
      onCommitError,
    });

    session.handle(batch());
    session.handle(batch({ phase: "up" }));

    expect(onPreview).toHaveBeenLastCalledWith([], []);
    expect(session.state).toEqual({ kind: "idle" });
    expect(onCommitError).toHaveBeenCalledWith(error);
  });

  it("reports rejection from a structural thenable", async () => {
    const error = new Error("cross-realm storage unavailable");
    const onCommitError = vi.fn();
    const thenable = {
      then: (
        _onfulfilled: unknown,
        onrejected: ((reason: unknown) => unknown) | null | undefined,
      ) => {
        onrejected?.(error);
        return Promise.resolve();
      },
    } as unknown as PromiseLike<void>;
    const session = new StrokeSession({
      onPreview: vi.fn(),
      onCommit: () => thenable,
      onCancel: vi.fn(),
      onCommitError,
    });

    session.handle(batch());
    session.handle(batch({ phase: "up" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onCommitError).toHaveBeenCalledWith(error);
  });

  it("blocks reentrant strokes while commit callbacks observe committing", () => {
    const observedStates: string[] = [];
    const onCommit = vi.fn(() => {
      observedStates.push(session.state.kind);
      session.handle(batch({ confirmed: [sample(9)] }));
    });
    const session = new StrokeSession({
      onPreview: (confirmed) => {
        if (confirmed.length === 0) {
          observedStates.push(session.state.kind);
          session.handle(batch({ confirmed: [sample(8)] }));
        }
      },
      onCommit,
      onCancel: vi.fn(),
    });

    session.handle(batch());
    session.handle(batch({ phase: "up" }));

    expect(observedStates).toEqual(["committing", "committing"]);
    expect(onCommit).toHaveBeenCalledWith([sample(1), sample(1)]);
    expect(session.state).toEqual({ kind: "idle" });
  });
});
