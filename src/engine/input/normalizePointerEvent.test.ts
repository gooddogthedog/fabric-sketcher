import { describe, expect, it } from "vitest";
import { identity, multiply, scale, translation } from "../math/affine";
import { normalizePointerEvent } from "./normalizePointerEvent";
import type { PointerEventLike } from "./types";

function pointerEvent(
  values: Partial<PointerEventLike> = {},
): PointerEventLike {
  return {
    pointerId: 7,
    pointerType: "pen",
    clientX: 0,
    clientY: 0,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    timeStamp: 0,
    ...values,
  };
}

describe("normalizePointerEvent", () => {
  it("keeps coalesced samples in their chronological order", () => {
    const first = pointerEvent({ clientX: 10, timeStamp: 10 });
    const second = pointerEvent({ clientX: 20, timeStamp: 20 });
    const event = pointerEvent({
      clientX: 30,
      timeStamp: 30,
      getCoalescedEvents: () => [first, second, event],
    });

    const batch = normalizePointerEvent(event, {
      phase: "move",
      surfaceBounds: { left: 0, top: 0 },
      inverseViewportMatrix: identity(),
    });

    expect(batch.confirmed.map((sample) => sample.time)).toEqual([10, 20, 30]);
  });

  it("includes the host event once when coalesced samples omit it", () => {
    const coalesced = pointerEvent({ clientX: 10, timeStamp: 10 });
    const event = pointerEvent({
      clientX: 20,
      timeStamp: 20,
      getCoalescedEvents: () => [coalesced],
    });

    const batch = normalizePointerEvent(event, {
      phase: "move",
      surfaceBounds: { left: 0, top: 0 },
      inverseViewportMatrix: identity(),
    });

    expect(batch.confirmed.map((sample) => sample.time)).toEqual([10, 20]);
  });

  it("keeps predicted samples separate from confirmed history", () => {
    const confirmed = pointerEvent({ clientX: 10, timeStamp: 10 });
    const predicted = pointerEvent({ clientX: 20, timeStamp: 20 });
    const event = pointerEvent({
      clientX: 10,
      timeStamp: 10,
      getCoalescedEvents: () => [confirmed, event],
      getPredictedEvents: () => [predicted],
    });

    const batch = normalizePointerEvent(event, {
      phase: "move",
      surfaceBounds: { left: 0, top: 0 },
      inverseViewportMatrix: identity(),
    });

    expect(batch.confirmed.map((sample) => sample.time)).toEqual([10, 10]);
    expect(batch.predicted.map((sample) => sample.time)).toEqual([20]);
  });

  it("clamps pressure to the web-platform range", () => {
    const lowPressure = pointerEvent({ pressure: -0.2 });
    const highPressure = pointerEvent({ pressure: 1.2 });
    const event = pointerEvent({
      getCoalescedEvents: () => [lowPressure, highPressure, event],
    });

    const batch = normalizePointerEvent(event, {
      phase: "move",
      surfaceBounds: { left: 0, top: 0 },
      inverseViewportMatrix: identity(),
    });

    expect(batch.confirmed.map((sample) => sample.pressure)).toEqual([
      0, 1, 0.5,
    ]);
  });

  it("defaults missing pen pressure to 0.5 on down", () => {
    const batch = normalizePointerEvent(pointerEvent({ pressure: null }), {
      phase: "down",
      surfaceBounds: { left: 0, top: 0 },
      inverseViewportMatrix: identity(),
    });

    expect(batch.confirmed[0]?.pressure).toBe(0.5);
  });

  it("defaults missing pen pressure to zero while hovering or ending", () => {
    const event = pointerEvent({ pressure: undefined });

    const hovering = normalizePointerEvent(event, {
      phase: "move",
      surfaceBounds: { left: 0, top: 0 },
      inverseViewportMatrix: identity(),
    });
    const ending = normalizePointerEvent(event, {
      phase: "up",
      surfaceBounds: { left: 0, top: 0 },
      inverseViewportMatrix: identity(),
    });

    expect(hovering.confirmed[0]?.pressure).toBe(0);
    expect(ending.confirmed[0]?.pressure).toBe(0);
  });

  it("preserves a valid numeric zero pressure", () => {
    const batch = normalizePointerEvent(pointerEvent({ pressure: 0 }), {
      phase: "down",
      surfaceBounds: { left: 0, top: 0 },
      inverseViewportMatrix: identity(),
    });

    expect(batch.confirmed[0]?.pressure).toBe(0);
  });

  it("converts client coordinates through the surface and inverse viewport", () => {
    const batch = normalizePointerEvent(
      pointerEvent({ clientX: 120, clientY: 70 }),
      {
        phase: "move",
        surfaceBounds: { left: 100, top: 50 },
        inverseViewportMatrix: multiply(translation(1, -2), scale(2, 3)),
      },
    );

    expect(batch.confirmed[0]).toMatchObject({ x: 41, y: 58 });
  });

  it("bounds tilt and twist to web-platform ranges", () => {
    const batch = normalizePointerEvent(
      pointerEvent({ tiltX: 100, tiltY: -100, twist: 400 }),
      {
        phase: "move",
        surfaceBounds: { left: 0, top: 0 },
        inverseViewportMatrix: identity(),
      },
    );

    expect(batch.confirmed[0]).toMatchObject({
      tiltX: 90,
      tiltY: -90,
      twist: 359,
    });
  });

  it("bounds altitude and azimuth to web-platform ranges", () => {
    const batch = normalizePointerEvent(
      pointerEvent({ altitudeAngle: -1, azimuthAngle: 10 }),
      {
        phase: "move",
        surfaceBounds: { left: 0, top: 0 },
        inverseViewportMatrix: identity(),
      },
    );

    expect(batch.confirmed[0]).toMatchObject({
      altitudeAngle: 0,
      azimuthAngle: 2 * Math.PI,
    });
  });

  it("keeps missing altitude and azimuth as null", () => {
    const batch = normalizePointerEvent(
      pointerEvent({ altitudeAngle: null, azimuthAngle: undefined }),
      {
        phase: "move",
        surfaceBounds: { left: 0, top: 0 },
        inverseViewportMatrix: identity(),
      },
    );

    expect(batch.confirmed[0]).toMatchObject({
      altitudeAngle: null,
      azimuthAngle: null,
    });
  });

  it("returns no confirmed or predicted samples for touch", () => {
    const predicted = pointerEvent({ pointerType: "touch", pressure: 1 });
    const event = pointerEvent({
      pointerType: "touch",
      pressure: 1,
      getPredictedEvents: () => [predicted],
    });

    const batch = normalizePointerEvent(event, {
      phase: "move",
      surfaceBounds: { left: 0, top: 0 },
      inverseViewportMatrix: identity(),
    });

    expect(batch).toMatchObject({
      pointerType: "touch",
      confirmed: [],
      predicted: [],
    });
  });
});
