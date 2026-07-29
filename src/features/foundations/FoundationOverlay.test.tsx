import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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

describe("FoundationOverlay", () => {
  it("renders only selected semantic groups under the artwork", () => {
    const ref = createRef<FoundationOverlayHandle>();

    render(
      <FoundationOverlay
        foundation={{
          ...figure,
          visibleLandmarkGroups: ["outline", "center"],
        }}
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
    render(<FoundationOverlay foundation={figure} ref={ref} />);

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
      <FoundationOverlay foundation={unavailable} />,
    );

    expect(
      container.querySelector("[data-foundation-missing='true']"),
    ).not.toBeNull();
    expect(container.querySelector("use")).toBeNull();
  });
});
