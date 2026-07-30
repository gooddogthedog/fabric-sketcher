import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DesignDocument } from "../../domain/document/types";
import type { Matrix3 } from "../../engine/math/affine";
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
import type { FoundationAssetHealth } from "../foundations/foundationAssetHealth";
import { LayersShelf, type EdgeShelfId } from "../foundations/LayersShelf";
import { QuickToolPuck } from "../tools/QuickToolPuck";
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
  const [openShelf, setOpenShelf] = useState<EdgeShelfId | null>(null);
  const [layersOpened, setLayersOpened] = useState(false);
  const [foundationPreview, setFoundationPreview] =
    useState<DesignDocument["foundation"]>(null);
  const [foundationAssetHealth, setFoundationAssetHealth] =
    useState<FoundationAssetHealth | null>(null);
  const [foundationAssetRetryToken, setFoundationAssetRetryToken] = useState(0);
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
      commitErase: store.commitErase.bind(store),
      getBrush: store.getActiveBrush,
      getTool: store.getActiveTool,
      getEraser: store.getActiveEraser,
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

  const commitFoundationTransform = (transform: Matrix3) => {
    const foundation = store.getSnapshot().document?.foundation;
    if (foundation && !foundation.locked) {
      return store.setFoundation({ ...foundation, transform });
    }
  };

  const changeShelf = (shelf: EdgeShelfId, open: boolean) => {
    if (shelf === "layers" && open) {
      setLayersOpened(true);
    }
    setOpenShelf(open ? shelf : null);
  };

  const foundation = snapshot.document?.foundation ?? null;
  const untouched =
    foundation === null && (snapshot.document?.strokes.length ?? 0) === 0;

  return (
    <section className="drawing-surface" aria-label="Design workspace">
      <div className="drawing-surface__field">
        <BrushShelf
          onOpenChange={(open) => changeShelf("brushes", open)}
          open={openShelf === "brushes"}
          store={store}
        />
        <div className="drawing-surface__paper">
          <FoundationOverlay
            assetRetryToken={foundationAssetRetryToken}
            foundation={foundationPreview ?? foundation}
            onAssetHealthChange={setFoundationAssetHealth}
            onCommitTransform={commitFoundationTransform}
            ref={foundationOverlayRef}
          />
          <div className="drawing-surface__canvas-mount" ref={canvasMountRef} />
        </div>
        <LayersShelf
          attention={untouched && !layersOpened}
          assetHealth={foundationAssetHealth}
          onOpenChange={(open) => changeShelf("layers", open)}
          onPreviewFoundation={setFoundationPreview}
          onRestoreFoundation={() =>
            setFoundationAssetRetryToken((token) => token + 1)
          }
          open={openShelf === "layers"}
          store={store}
        />
      </div>
      <QuickToolPuck
        onOpenBrushes={() => changeShelf("brushes", true)}
        store={store}
      />
      {compatibilityMode ? (
        <p className="compatibility-notice" role="status">
          Compatibility rendering is active.
        </p>
      ) : null}
    </section>
  );
}
