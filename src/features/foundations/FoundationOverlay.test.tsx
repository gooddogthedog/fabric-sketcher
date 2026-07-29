import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFoundationState } from "../../domain/document/foundationState";
import type { FoundationState } from "../../domain/document/types";
import {
  FoundationOverlay,
  type FoundationOverlayHandle,
} from "./FoundationOverlay";

const figure: FoundationState = createFoundationState({
  assetId: "neutral-figure-front",
  assetVersion: 1,
  foundationType: "figure",
  visibleLandmarkGroups: ["outline", "center", "levels"],
});

afterEach(cleanup);

function pointerEvent(
  type: string,
  values: Readonly<{
    pointerId: number;
    pointerType: string;
    x: number;
    y: number;
  }>,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { configurable: true, value: values.pointerId },
    pointerType: { configurable: true, value: values.pointerType },
    clientX: { configurable: true, value: values.x },
    clientY: { configurable: true, value: values.y },
  });
  return event;
}

describe("FoundationOverlay", () => {
  it("renders only selected semantic groups under the artwork", () => {
    const ref = createRef<FoundationOverlayHandle>();

    render(
      <FoundationOverlay
        foundation={{
          ...figure,
          visibleLandmarkGroups: ["outline", "center"],
        }}
        onCommitTransform={vi.fn()}
        ref={ref}
      />,
    );

    expect(screen.getByTestId("foundation-outline-use")).toHaveAttribute(
      "href",
      "/foundations/neutral-figure-front-v1.svg#foundation-outline",
    );
    expect(screen.getByTestId("foundation-center-use")).toHaveAttribute(
      "href",
      "/foundations/neutral-figure-front-v1.svg#foundation-center",
    );
    expect(screen.queryByTestId("foundation-levels-use")).toBeNull();
    expect(screen.queryByTestId("foundation-construction-use")).toBeNull();
  });

  it("imperatively composes viewport and foundation transforms", () => {
    const ref = createRef<FoundationOverlayHandle>();
    render(
      <FoundationOverlay
        foundation={{
          ...figure,
          transform: [1, 0, 7, 0, 1, 11, 0, 0, 1],
        }}
        onCommitTransform={vi.fn()}
        ref={ref}
      />,
    );

    ref.current?.setViewport([2, 0, 40, 0, 3, 50, 0, 0, 1]);

    expect(screen.getByTestId("foundation-transform")).toHaveAttribute(
      "transform",
      "matrix(2 0 0 3 54 83)",
    );
    expect(ref.current?.getInverseViewport()).toEqual([
      0.5,
      0,
      -20,
      0,
      1 / 3,
      -50 / 3,
      0,
      0,
      1,
    ]);
  });

  it("uses and clears an imperative preview transform", () => {
    const ref = createRef<FoundationOverlayHandle>();
    render(
      <FoundationOverlay
        foundation={figure}
        onCommitTransform={vi.fn()}
        ref={ref}
      />,
    );

    ref.current?.setViewport([2, 0, 10, 0, 2, 20, 0, 0, 1]);
    ref.current?.setPreviewTransform([1, 0, 5, 0, 1, 7, 0, 0, 1]);
    expect(screen.getByTestId("foundation-transform")).toHaveAttribute(
      "transform",
      "matrix(2 0 0 2 20 34)",
    );

    ref.current?.setPreviewTransform(null);
    expect(screen.getByTestId("foundation-transform")).toHaveAttribute(
      "transform",
      "matrix(2 0 0 2 10 20)",
    );
  });

  it("renders an unavailable pinned asset as safely missing", () => {
    const unavailable: FoundationState = {
      ...figure,
      assetId: "retired-foundation",
    };

    const { container } = render(
      <FoundationOverlay
        foundation={unavailable}
        onCommitTransform={vi.fn()}
      />,
    );

    expect(
      container.querySelector("[data-foundation-missing='true']"),
    ).not.toBeNull();
    expect(container.querySelector("use")).toBeNull();
  });

  it("marks a known pinned asset unavailable when its SVG use fails to load", () => {
    const { container } = render(
      <FoundationOverlay foundation={figure} onCommitTransform={vi.fn()} />,
    );

    fireEvent.error(screen.getByTestId("foundation-outline-use"));

    expect(
      container.querySelector("[data-foundation-missing='true']"),
    ).not.toBeNull();
    expect(container.querySelector("use")).toBeNull();
  });

  it("renders a transformed boundary and asset-sized hit target only when unlocked", () => {
    const unlocked = { ...figure, locked: false };
    const { container, rerender } = render(
      <FoundationOverlay foundation={unlocked} onCommitTransform={vi.fn()} />,
    );

    const interaction = container.querySelector(
      ".foundation-overlay__interaction",
    );
    expect(interaction).not.toBeNull();
    expect(interaction).toHaveStyle({ pointerEvents: "none" });
    expect(screen.getByTestId("foundation-transform-boundary")).toHaveAttribute(
      "transform",
      "matrix(1 0 0 1 0 0)",
    );
    expect(screen.getByTestId("foundation-boundary")).toHaveAttribute(
      "x",
      "690",
    );
    expect(screen.getByTestId("foundation-boundary")).toHaveAttribute(
      "width",
      "1100",
    );
    expect(screen.getByTestId("foundation-hit-target")).toHaveAttribute(
      "height",
      "3160",
    );
    expect(screen.getByTestId("foundation-hit-target")).toHaveAttribute(
      "pointer-events",
      "all",
    );

    rerender(
      <FoundationOverlay
        foundation={{ ...unlocked, locked: true }}
        onCommitTransform={vi.fn()}
      />,
    );
    expect(interaction).toHaveStyle({ pointerEvents: "none" });
    expect(
      screen.queryByTestId("foundation-transform-boundary"),
    ).not.toBeInTheDocument();
  });

  it("previews both guide and boundary imperatively, then commits the gesture", () => {
    const ref = createRef<FoundationOverlayHandle>();
    const onCommitTransform = vi.fn();
    const { container } = render(
      <FoundationOverlay
        foundation={{ ...figure, locked: false }}
        onCommitTransform={onCommitTransform}
        ref={ref}
      />,
    );

    ref.current?.setViewport([2, 0, 10, 0, 2, 20, 0, 0, 1]);
    ref.current?.setPreviewTransform([1, 0, 5, 0, 1, 7, 0, 0, 1]);
    expect(screen.getByTestId("foundation-transform")).toHaveAttribute(
      "transform",
      "matrix(2 0 0 2 20 34)",
    );
    expect(screen.getByTestId("foundation-transform-boundary")).toHaveAttribute(
      "transform",
      "matrix(2 0 0 2 20 34)",
    );

    ref.current?.setPreviewTransform(null);
    const interaction = container.querySelector(
      ".foundation-overlay__interaction",
    );
    if (!(interaction instanceof SVGSVGElement)) {
      throw new Error("Expected the foundation interaction surface.");
    }
    const hitTarget = screen.getByTestId("foundation-hit-target");
    hitTarget.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 7,
        pointerType: "pen",
        x: 100,
        y: 200,
      }),
    );
    hitTarget.dispatchEvent(
      pointerEvent("pointermove", {
        pointerId: 7,
        pointerType: "pen",
        x: 140,
        y: 260,
      }),
    );
    hitTarget.dispatchEvent(
      pointerEvent("pointerup", {
        pointerId: 7,
        pointerType: "pen",
        x: 140,
        y: 260,
      }),
    );

    expect(onCommitTransform).toHaveBeenCalledTimes(1);
    expect(onCommitTransform).toHaveBeenCalledWith([
      1, 0, 20, 0, 1, 30, 0, 0, 1,
    ]);
  });
});
