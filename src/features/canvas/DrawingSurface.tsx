import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DesignDocument } from "../../domain/document/types";
import {
  createRenderer,
  type RendererSelection,
} from "../../engine/render/createRenderer";
import type { EditorStore } from "../../state/editorStore";
import { BrushShelf } from "../brushes/BrushShelf";
import {
  FoundationOverlay,
  type FoundationOverlayHandle,
} from "../foundations/FoundationOverlay";
import {
  createDrawingController,
  type DrawingViewportFactory,
} from "./createDrawingController";

export type DrawingSurfaceProps = Readonly<{
  document: DesignDocument;
  store: EditorStore;
  rendererFactory?: (surface: HTMLCanvasElement) => RendererSelection;
  viewportFactory?: DrawingViewportFactory;
}>;

export function DrawingSurface({
  document,
  store,
  rendererFactory = createRenderer,
  viewportFactory,
}: DrawingSurfaceProps) {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const foundationOverlayRef = useRef<FoundationOverlayHandle>(null);
  const [compatibilityMode, setCompatibilityMode] = useState(false);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { projectId, title, width, height } = document;

  useLayoutEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) {
      return;
    }

    const candidate = globalThis.document.createElement("canvas");
    candidate.className = "drawing-surface__canvas";
    mount.replaceChildren(candidate);

    const selection = rendererFactory(candidate);
    const surface = selection.surface;
    if (surface.parentElement !== mount) {
      mount.replaceChildren(surface);
    }
    surface.className = "drawing-surface__canvas";
    surface.tabIndex = 0;
    surface.setAttribute("aria-label", `Drawing canvas for ${title}`);
    surface.style.touchAction = "none";

    const controller = createDrawingController({
      surface,
      renderer: selection.renderer,
      document: {
        ...document,
        projectId,
        title,
        width,
        height,
      },
      commitStroke: store.commitStroke.bind(store),
      getBrush: store.getActiveBrush,
      viewportFactory,
      onViewportChange: (matrix) => {
        foundationOverlayRef.current?.setViewport(matrix);
      },
    });
    const detachRenderer = store.attachRenderer(
      selection.renderer,
      controller.requestRender,
    );
    setCompatibilityMode(selection.renderer.kind === "canvas2d-compat");
    surface.focus({ preventScroll: true });

    return () => {
      controller.dispose();
      detachRenderer();
      selection.renderer.dispose();
      mount.replaceChildren();
    };
    // The scalar dependencies keep the controller alive across save updates.
  }, [
    height,
    projectId,
    rendererFactory,
    store,
    title,
    viewportFactory,
    width,
  ]);

  const canUndo =
    snapshot.document?.strokes.some(
      (stroke) =>
        !snapshot.document?.hiddenStrokeIds.includes(stroke.operationId),
    ) ?? false;

  return (
    <section className="drawing-surface" aria-label="Design workspace">
      <div className="drawing-surface__field">
        <BrushShelf store={store} />
        <div className="drawing-surface__paper">
          <FoundationOverlay
            foundation={snapshot.document?.foundation ?? null}
            ref={foundationOverlayRef}
          />
          <div className="drawing-surface__canvas-mount" ref={canvasMountRef} />
        </div>
      </div>
      <div className="drawing-surface__actions">
        <button
          className="undo-control"
          disabled={!canUndo}
          onClick={() => void store.undoLastStroke()}
          type="button"
        >
          Undo last stroke
        </button>
      </div>
      {compatibilityMode ? (
        <p className="compatibility-notice" role="status">
          Compatibility rendering is active.
        </p>
      ) : null}
    </section>
  );
}
