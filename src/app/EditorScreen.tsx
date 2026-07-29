import type { DesignDocument } from "../domain/document/types";
import type { RendererSelection } from "../engine/render/createRenderer";
import { DrawingSurface } from "../features/canvas/DrawingSurface";
import type { EditorSaveStatus, EditorStore } from "../state/editorStore";

export type EditorScreenProps = Readonly<{
  document: DesignDocument;
  saveStatus: EditorSaveStatus;
  saveError: string | null;
  store: EditorStore;
  rendererFactory?: (surface: HTMLCanvasElement) => RendererSelection;
}>;

export function EditorScreen({
  document,
  saveStatus,
  saveError,
  store,
  rendererFactory,
}: EditorScreenProps) {
  return (
    <main className="editor-shell">
      <header className="editor-header">
        <button
          aria-label="Back to designs"
          className="editor-header__back"
          onClick={() => void store.closeProject()}
          type="button"
        >
          <BackIcon />
        </button>
        <div className="editor-header__identity">
          <h1>{document.title}</h1>
          <SaveStatus error={saveError} status={saveStatus} store={store} />
        </div>
        <span aria-hidden="true" className="editor-header__balance" />
      </header>
      <DrawingSurface
        document={document}
        rendererFactory={rendererFactory}
        store={store}
      />
    </main>
  );
}

function SaveStatus({
  status,
  error,
  store,
}: Readonly<{
  status: EditorSaveStatus;
  error: string | null;
  store: EditorStore;
}>) {
  if (status === "error") {
    return (
      <div className="save-status save-status--error" role="status">
        <span title={error ?? undefined}>Save failed on this iPad</span>
        <button onClick={() => void store.retrySave()} type="button">
          Retry save
        </button>
      </div>
    );
  }

  return (
    <p className="save-status" role="status">
      {status === "saving" ? "Saving on this iPad…" : "Saved on this iPad"}
    </p>
  );
}

function BackIcon() {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
      <path d="m14.5 5-7 7 7 7M8 12h11" />
    </svg>
  );
}
