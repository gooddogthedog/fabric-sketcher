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
import { getFoundationAsset } from "./foundationCatalog";
import { svgMatrix } from "./svgMatrix";

export type FoundationOverlayHandle = Readonly<{
  setViewport(matrix: Matrix3): void;
  setPreviewTransform(transform: Matrix3 | null): void;
  getInverseViewport(): Matrix3;
}>;

export type FoundationOverlayProps = Readonly<{
  foundation: FoundationState | null;
}>;

export const FoundationOverlay = forwardRef<
  FoundationOverlayHandle,
  FoundationOverlayProps
>(function FoundationOverlay({ foundation }, ref) {
  const transformRef = useRef<SVGGElement>(null);
  const foundationRef = useRef(foundation);
  const viewportRef = useRef<Matrix3>(identity());
  const previewTransformRef = useRef<Matrix3 | null>(null);
  foundationRef.current = foundation;

  const applyTransform = () => {
    const group = transformRef.current;
    const currentFoundation = foundationRef.current;
    if (!group || !currentFoundation) {
      return;
    }
    const composed = multiply(
      viewportRef.current,
      previewTransformRef.current ?? currentFoundation.transform,
    );
    group.setAttribute("transform", svgMatrix(composed));
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
  const visibleGroups =
    foundation?.visible && asset
      ? asset.groups.filter((group) =>
          foundation.visibleLandmarkGroups.includes(group.id),
        )
      : [];

  return (
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
  );
});
