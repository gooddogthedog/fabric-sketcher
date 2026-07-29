import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import type { FoundationState } from "../../domain/document/types";
import {
  identity,
  invert,
  multiply,
  type Matrix3,
} from "../../engine/math/affine";
import { createFoundationTransformController } from "./createFoundationTransformController";
import { getFoundationAsset } from "./foundationCatalog";
import { svgMatrix } from "./svgMatrix";

export type FoundationOverlayHandle = Readonly<{
  setViewport(matrix: Matrix3): void;
  setPreviewTransform(transform: Matrix3 | null): void;
  getInverseViewport(): Matrix3;
}>;

export type FoundationOverlayProps = Readonly<{
  foundation: FoundationState | null;
  onCommitTransform: (transform: Matrix3) => void | PromiseLike<void>;
}>;

export const FoundationOverlay = forwardRef<
  FoundationOverlayHandle,
  FoundationOverlayProps
>(function FoundationOverlay({ foundation, onCommitTransform }, ref) {
  const transformRef = useRef<SVGGElement>(null);
  const interactionRef = useRef<SVGSVGElement>(null);
  const boundaryTransformRef = useRef<SVGGElement>(null);
  const foundationRef = useRef(foundation);
  const commitTransformRef = useRef(onCommitTransform);
  const viewportRef = useRef<Matrix3>(identity());
  const previewTransformRef = useRef<Matrix3 | null>(null);
  foundationRef.current = foundation;
  commitTransformRef.current = onCommitTransform;

  const applyTransform = () => {
    const group = transformRef.current;
    const boundary = boundaryTransformRef.current;
    const currentFoundation = foundationRef.current;
    if (!currentFoundation) {
      return;
    }
    const composed = multiply(
      viewportRef.current,
      previewTransformRef.current ?? currentFoundation.transform,
    );
    const transform = svgMatrix(composed);
    group?.setAttribute("transform", transform);
    boundary?.setAttribute("transform", transform);
  };

  useImperativeHandle(ref, () => ({
    setViewport(matrix) {
      viewportRef.current = matrix;
      applyTransform();
    },
    setPreviewTransform(transform) {
      previewTransformRef.current = transform;
      applyTransform();
    },
    getInverseViewport() {
      return invert(viewportRef.current);
    },
  }));

  useLayoutEffect(applyTransform, [foundation]);

  const asset = foundation
    ? getFoundationAsset(foundation.assetId, foundation.assetVersion)
    : null;
  const missing = foundation !== null && asset === null;
  const interactive =
    foundation !== null && asset !== null && !foundation.locked;
  const visibleGroups =
    foundation?.visible && asset
      ? asset.groups.filter((group) =>
          foundation.visibleLandmarkGroups.includes(group.id),
        )
      : [];

  useLayoutEffect(() => {
    const surface = interactionRef.current;
    if (!surface || !interactive) {
      return;
    }
    const controller = createFoundationTransformController({
      surface,
      getFoundation: () => foundationRef.current,
      getInverseViewport: () => invert(viewportRef.current),
      previewTransform: (transform) => {
        previewTransformRef.current = transform;
        applyTransform();
      },
      commitTransform: (transform) => commitTransformRef.current(transform),
    });
    return () => controller.dispose();
  }, [interactive]);

  return (
    <>
      <svg
        aria-hidden="true"
        className="foundation-overlay__guide"
        data-foundation-missing={missing ? "true" : undefined}
      >
        {foundation && asset ? (
          <g
            data-testid="foundation-transform"
            fill="none"
            opacity={foundation.opacity}
            ref={transformRef}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          >
            {visibleGroups.map((group) => (
              <use
                data-testid={`foundation-${group.id}-use`}
                height={asset.viewBox.height}
                href={`${asset.sourceUrl}#${group.symbolId}`}
                key={group.id}
                vectorEffect="non-scaling-stroke"
                width={asset.viewBox.width}
                x={asset.viewBox.x}
                y={asset.viewBox.y}
              />
            ))}
          </g>
        ) : null}
      </svg>
      <svg
        aria-hidden="true"
        className="foundation-overlay__interaction"
        ref={interactionRef}
        style={{
          pointerEvents: "none",
          touchAction: interactive ? "none" : "auto",
        }}
      >
        {interactive && foundation && asset ? (
          <g
            data-testid="foundation-transform-boundary"
            ref={boundaryTransformRef}
          >
            <rect
              data-testid="foundation-boundary"
              fill="none"
              height={asset.bounds.height}
              pointerEvents="none"
              stroke="currentColor"
              strokeDasharray="8 8"
              vectorEffect="non-scaling-stroke"
              width={asset.bounds.width}
              x={asset.bounds.x}
              y={asset.bounds.y}
            />
            <rect
              className="foundation-overlay__hit-target"
              data-testid="foundation-hit-target"
              fill="transparent"
              height={asset.bounds.height}
              pointerEvents={interactive ? "all" : "none"}
              width={asset.bounds.width}
              x={asset.bounds.x}
              y={asset.bounds.y}
            />
          </g>
        ) : null}
      </svg>
    </>
  );
});
