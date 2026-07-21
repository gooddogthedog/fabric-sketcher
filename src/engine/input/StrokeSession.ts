import type { PenSample } from "../../domain/document/types";
import type { InputBatch } from "./types";

export type StrokeSessionState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{
      kind: "drawing";
      pointerId: number;
      confirmed: readonly PenSample[];
      predicted: readonly PenSample[];
    }>
  | Readonly<{
      kind: "committing";
      pointerId: number;
      confirmed: readonly PenSample[];
    }>;

export type StrokeSessionCallbacks = Readonly<{
  onPreview: (
    confirmed: readonly PenSample[],
    predicted: readonly PenSample[],
  ) => void;
  onCommit: (samples: readonly PenSample[]) => void | Promise<void>;
  onCancel: () => void;
}>;

type DrawingState = Extract<StrokeSessionState, { kind: "drawing" }>;

const emptySamples: readonly PenSample[] = Object.freeze([] as PenSample[]);
const idleState: StrokeSessionState = Object.freeze({ kind: "idle" });

export class StrokeSession {
  #state: StrokeSessionState = idleState;
  readonly #callbacks: StrokeSessionCallbacks;
  readonly #pendingCommits = new Set<Promise<void>>();

  constructor(callbacks: StrokeSessionCallbacks) {
    this.#callbacks = callbacks;
  }

  get state(): StrokeSessionState {
    return this.#state;
  }

  lostPointerCapture(pointerId: number): void {
    if (this.#state.kind !== "drawing" || this.#state.pointerId !== pointerId) {
      return;
    }

    this.cancel();
  }

  handle(batch: InputBatch): void {
    if (this.#state.kind === "idle") {
      this.start(batch);
      return;
    }

    if (
      this.#state.kind !== "drawing" ||
      batch.pointerId !== this.#state.pointerId
    ) {
      return;
    }

    switch (batch.phase) {
      case "move":
        this.update(batch);
        return;
      case "up":
        this.finish(batch);
        return;
      case "cancel":
        this.cancel();
        return;
      case "down":
        return;
    }
  }

  private start(batch: InputBatch): void {
    if (batch.phase !== "down" || batch.pointerType !== "pen") {
      return;
    }

    this.#state = drawingState(
      batch.pointerId,
      batch.confirmed,
      batch.predicted,
    );
    this.preview();
  }

  private update(batch: InputBatch): void {
    const state = this.#state as DrawingState;
    this.#state = drawingState(
      state.pointerId,
      [...state.confirmed, ...batch.confirmed],
      batch.predicted,
    );
    this.preview();
  }

  private finish(batch: InputBatch): void {
    const state = this.#state as DrawingState;
    const samples = immutableSamples([...state.confirmed, ...batch.confirmed]);
    this.#state = idleState;
    this.#callbacks.onPreview(samples, emptySamples);
    this.commit(samples);
  }

  private cancel(): void {
    this.#state = idleState;
    this.#callbacks.onPreview(emptySamples, emptySamples);
    this.#callbacks.onCancel();
  }

  private preview(): void {
    const state = this.#state as DrawingState;
    this.#callbacks.onPreview(state.confirmed, state.predicted);
  }

  private commit(samples: readonly PenSample[]): void {
    try {
      const result = this.#callbacks.onCommit(samples);
      if (result instanceof Promise) {
        this.#pendingCommits.add(result);
        void result.then(
          () => this.#pendingCommits.delete(result),
          () => this.#pendingCommits.delete(result),
        );
      }
    } catch {
      // Durability errors are owned by the persistence callback.
    }
  }
}

function drawingState(
  pointerId: number,
  confirmed: readonly PenSample[],
  predicted: readonly PenSample[],
): DrawingState {
  return Object.freeze({
    kind: "drawing",
    pointerId,
    confirmed: immutableSamples(confirmed),
    predicted: immutableSamples(predicted),
  });
}

function immutableSamples(samples: readonly PenSample[]): readonly PenSample[] {
  return Object.freeze([...samples]);
}
