import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type {
  FoundationLandmarkGroup,
  FoundationState,
} from "../../domain/document/types";
import type { EditorStore } from "../../state/editorStore";
import {
  createDefaultFoundationState,
  getFoundationAsset,
  getFoundationAssets,
} from "./foundationCatalog";
import {
  flipFoundation,
  replaceFoundationAsset,
  setFoundationScale,
} from "./foundationEdits";
import type { FoundationAsset } from "./types";

export type EdgeShelfId = "brushes" | "layers";

export type ControlledShelfProps = Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
}>;

export type LayersShelfProps = ControlledShelfProps &
  Readonly<{
    store: EditorStore;
    attention?: boolean;
    onPreviewFoundation?: (foundation: FoundationState | null) => void;
  }>;

type PendingRange = Readonly<{
  kind: "opacity" | "scale";
  foundation: FoundationState;
}>;

export function LayersShelf({
  store,
  open,
  onOpenChange,
  attention = false,
  onPreviewFoundation,
}: LayersShelfProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const foundation = snapshot.document?.foundation ?? null;
  const asset = foundation
    ? getFoundationAsset(foundation.assetId, foundation.assetVersion)
    : null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [opacityPreview, setOpacityPreview] = useState<number | null>(null);
  const [scalePreview, setScalePreview] = useState<number | null>(null);
  const pendingRangeRef = useRef<PendingRange | null>(null);
  const previousOpenRef = useRef(open);

  useEffect(() => {
    const wasOpen = previousOpenRef.current;
    previousOpenRef.current = open;
    if (!wasOpen || open || pendingRangeRef.current === null) {
      return;
    }

    pendingRangeRef.current = null;
    setOpacityPreview(null);
    setScalePreview(null);
    onPreviewFoundation?.(null);
  }, [onPreviewFoundation, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    const closeOnCanvasContact = (event: PointerEvent) => {
      if (event.target instanceof HTMLCanvasElement) {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnCanvasContact);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnCanvasContact);
    };
  }, [onOpenChange, open]);

  const commit = (next: FoundationState | null) => {
    pendingRangeRef.current = null;
    setOpacityPreview(null);
    setScalePreview(null);
    onPreviewFoundation?.(null);
    void store.setFoundation(next);
  };

  const previewRange = (
    kind: PendingRange["kind"],
    next: FoundationState,
    value: number,
  ) => {
    pendingRangeRef.current = { kind, foundation: next };
    if (kind === "opacity") {
      setOpacityPreview(value);
    } else {
      setScalePreview(value);
    }
    onPreviewFoundation?.(next);
  };

  const commitPendingRange = () => {
    const pending = pendingRangeRef.current;
    if (!pending) {
      return;
    }
    pendingRangeRef.current = null;
    commit(pending.foundation);
  };

  const selectAsset = (nextAsset: FoundationAsset) => {
    commit(
      foundation
        ? replaceFoundationAsset(foundation, nextAsset)
        : createDefaultFoundationState(nextAsset),
    );
    setPickerOpen(false);
  };

  return (
    <div className="layers-shelf">
      <button
        aria-expanded={open}
        className="layers-shelf__handle"
        data-attention={attention ? "true" : undefined}
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        Layers
      </button>
      {open ? (
        <aside className="layers-shelf__panel" aria-label="Layers">
          <div className="layers-shelf__heading">
            <h2>Layers</h2>
            <button
              aria-label="Close layers"
              className="layers-shelf__close"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="layers-shelf__content">
            {!foundation ? (
              <EmptyFoundation
                onAdd={() => setPickerOpen(true)}
                pickerOpen={pickerOpen}
                selectAsset={selectAsset}
              />
            ) : asset ? (
              <AvailableFoundation
                asset={asset}
                foundation={foundation}
                opacity={opacityPreview ?? foundation.opacity}
                onCommit={commit}
                onPreviewRange={previewRange}
                onRangeCommit={commitPendingRange}
                onReplace={() => setPickerOpen(true)}
                pickerOpen={pickerOpen}
                scale={
                  scalePreview ??
                  Math.hypot(foundation.transform[0], foundation.transform[3])
                }
                selectAsset={selectAsset}
              />
            ) : (
              <UnavailableFoundation
                onRemove={() => commit(null)}
                onReplace={() => setPickerOpen(true)}
                pickerOpen={pickerOpen}
                selectAsset={selectAsset}
              />
            )}
            <div className="layers-shelf__row layers-shelf__row--artwork">
              <span className="layers-shelf__row-title">Artwork</span>
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function EmptyFoundation({
  onAdd,
  pickerOpen,
  selectAsset,
}: Readonly<{
  onAdd: () => void;
  pickerOpen: boolean;
  selectAsset: (asset: FoundationAsset) => void;
}>) {
  return (
    <section className="layers-shelf__foundation">
      <div className="layers-shelf__row">
        <span className="layers-shelf__row-title">Foundation</span>
        <span className="layers-shelf__row-detail">None</span>
      </div>
      {pickerOpen ? (
        <FoundationPicker selectAsset={selectAsset} />
      ) : (
        <button
          className="layers-shelf__action layers-shelf__action--primary"
          onClick={onAdd}
          type="button"
        >
          Add foundation
        </button>
      )}
    </section>
  );
}

function AvailableFoundation({
  asset,
  foundation,
  opacity,
  scale: scaleValue,
  pickerOpen,
  onCommit,
  onPreviewRange,
  onRangeCommit,
  onReplace,
  selectAsset,
}: Readonly<{
  asset: FoundationAsset;
  foundation: FoundationState;
  opacity: number;
  scale: number;
  pickerOpen: boolean;
  onCommit: (foundation: FoundationState | null) => void;
  onPreviewRange: (
    kind: PendingRange["kind"],
    foundation: FoundationState,
    value: number,
  ) => void;
  onRangeCommit: () => void;
  onReplace: () => void;
  selectAsset: (asset: FoundationAsset) => void;
}>) {
  const toggleLandmark = (group: FoundationLandmarkGroup) => {
    const visible = foundation.visibleLandmarkGroups.includes(group);
    onCommit({
      ...foundation,
      visibleLandmarkGroups: visible
        ? foundation.visibleLandmarkGroups.filter((entry) => entry !== group)
        : [...foundation.visibleLandmarkGroups, group],
    });
  };

  return (
    <section className="layers-shelf__foundation">
      <div className="layers-shelf__asset">
        <FoundationThumbnail asset={asset} />
        <div>
          <span className="layers-shelf__eyebrow">Foundation</span>
          <span className="layers-shelf__asset-name">{asset.name}</span>
        </div>
      </div>
      {pickerOpen ? (
        <FoundationPicker selectAsset={selectAsset} />
      ) : (
        <>
          <RangeControl
            label="Foundation opacity"
            max={1}
            min={0.1}
            onChange={(value) =>
              onPreviewRange(
                "opacity",
                { ...foundation, opacity: value },
                value,
              )
            }
            onCommit={onRangeCommit}
            output={`${Math.round(opacity * 100)}%`}
            step={0.05}
            value={opacity}
          />
          <div className="layers-shelf__button-grid">
            <button
              className="layers-shelf__action"
              onClick={() =>
                onCommit({ ...foundation, visible: !foundation.visible })
              }
              type="button"
            >
              {foundation.visible ? "Hide foundation" : "Show foundation"}
            </button>
            <button
              className="layers-shelf__action"
              onClick={() =>
                onCommit({ ...foundation, locked: !foundation.locked })
              }
              type="button"
            >
              {foundation.locked ? "Unlock foundation" : "Lock foundation"}
            </button>
          </div>
          <fieldset className="layers-shelf__landmarks">
            <legend>Landmarks</legend>
            {asset.groups.map((group) => (
              <label key={group.id}>
                <input
                  checked={foundation.visibleLandmarkGroups.includes(group.id)}
                  onChange={() => toggleLandmark(group.id)}
                  type="checkbox"
                />
                <span>{group.label}</span>
              </label>
            ))}
          </fieldset>
          <RangeControl
            label="Foundation scale"
            max={4}
            min={0.25}
            onChange={(value) =>
              onPreviewRange(
                "scale",
                setFoundationScale(foundation, asset, value),
                value,
              )
            }
            onCommit={onRangeCommit}
            output={`${Math.round(scaleValue * 100)}%`}
            step={0.05}
            value={scaleValue}
          />
          <button
            className="layers-shelf__action"
            onClick={() => onCommit(flipFoundation(foundation, asset))}
            type="button"
          >
            Flip horizontally
          </button>
          <div className="layers-shelf__button-grid">
            <button
              aria-label="Replace foundation"
              className="layers-shelf__action"
              onClick={onReplace}
              type="button"
            >
              Replace
            </button>
            <button
              aria-label="Remove foundation"
              className="layers-shelf__action layers-shelf__action--danger"
              onClick={() => onCommit(null)}
              type="button"
            >
              Remove
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function UnavailableFoundation({
  pickerOpen,
  onReplace,
  onRemove,
  selectAsset,
}: Readonly<{
  pickerOpen: boolean;
  onReplace: () => void;
  onRemove: () => void;
  selectAsset: (asset: FoundationAsset) => void;
}>) {
  return (
    <section className="layers-shelf__foundation">
      <div className="layers-shelf__unavailable">
        <strong>Foundation unavailable</strong>
        <span>Your artwork is safe.</span>
      </div>
      {pickerOpen ? (
        <FoundationPicker selectAsset={selectAsset} />
      ) : (
        <div className="layers-shelf__button-grid">
          <button
            aria-label="Replace foundation"
            className="layers-shelf__action"
            onClick={onReplace}
            type="button"
          >
            Replace
          </button>
          <button
            aria-label="Remove foundation"
            className="layers-shelf__action layers-shelf__action--danger"
            onClick={onRemove}
            type="button"
          >
            Remove
          </button>
        </div>
      )}
    </section>
  );
}

function FoundationPicker({
  selectAsset,
}: Readonly<{ selectAsset: (asset: FoundationAsset) => void }>) {
  return (
    <div aria-label="Foundation choices" className="layers-shelf__picker">
      {getFoundationAssets().map((asset) => (
        <button
          className="layers-shelf__choice"
          key={`${asset.id}@${asset.version}`}
          onClick={() => selectAsset(asset)}
          type="button"
        >
          <FoundationThumbnail asset={asset} />
          <span>{asset.name}</span>
        </button>
      ))}
    </div>
  );
}

function FoundationThumbnail({ asset }: Readonly<{ asset: FoundationAsset }>) {
  return (
    <svg
      aria-hidden="true"
      className="layers-shelf__thumbnail"
      viewBox="0 0 40 48"
    >
      {asset.foundationType === "figure" ? (
        <>
          <circle cx="20" cy="7" r="4" />
          <path d="M20 11v14M13 16l7-3 7 3M14 33l6-8 6 8M16 44l4-19 4 19" />
        </>
      ) : (
        <>
          <path d="M14 6h12l-2 7 4 7-3 13H15l-3-13 4-7-2-7Z" />
          <path d="M20 6v38M12 44h16M16 33l-2 11M24 33l2 11" />
        </>
      )}
    </svg>
  );
}

function RangeControl({
  label,
  min,
  max,
  step,
  value,
  output,
  onChange,
  onCommit,
}: Readonly<{
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  output: string;
  onChange: (value: number) => void;
  onCommit: () => void;
}>) {
  const shortLabel = label.replace("Foundation ", "");
  const displayLabel = shortLabel.charAt(0).toUpperCase() + shortLabel.slice(1);
  return (
    <label className="layers-shelf__range">
      <span>
        <span>{displayLabel}</span>
        <output>{output}</output>
      </span>
      <input
        aria-label={label}
        max={max}
        min={min}
        onBlur={onCommit}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        onKeyUp={onCommit}
        onPointerUp={onCommit}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
