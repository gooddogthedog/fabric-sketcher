import { useEffect, useSyncExternalStore } from "react";
import { BRUSH_PRESETS } from "../../engine/brush/presets";
import type { EditorStore } from "../../state/editorStore";
import type { ControlledShelfProps } from "../foundations/LayersShelf";

export type BrushShelfProps = ControlledShelfProps &
  Readonly<{
    store: EditorStore;
  }>;

export function BrushShelf({ store, open, onOpenChange }: BrushShelfProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

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

  return (
    <div className="brush-shelf">
      <button
        aria-expanded={open}
        className="brush-shelf__handle"
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        Brushes
      </button>
      {open ? (
        <aside className="brush-shelf__panel" aria-label="Brushes">
          <div className="brush-shelf__heading">
            <h2>Brushes</h2>
            <button
              aria-label="Close brushes"
              className="brush-shelf__close"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div
            aria-label="Brush presets"
            className="brush-shelf__presets"
            role="radiogroup"
          >
            {BRUSH_PRESETS.map((preset) => {
              const selected = snapshot.brush.id === preset.id;
              return (
                <label className="brush-shelf__preset" key={preset.id}>
                  <input
                    checked={selected}
                    name="brush-preset"
                    onChange={() => store.selectBrush(preset.id)}
                    type="radio"
                    value={preset.id}
                  />
                  <span
                    aria-hidden="true"
                    className="brush-shelf__swatch"
                    data-texture={preset.texture.kind}
                    style={{ backgroundColor: preset.color }}
                  />
                  <span className="brush-shelf__preset-name">
                    {preset.name}
                  </span>
                </label>
              );
            })}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
