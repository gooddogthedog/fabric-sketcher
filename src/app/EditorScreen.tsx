import { useEffect, useState } from "react";
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
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(document.title);

  useEffect(() => {
    if (!renaming) {
      setDraftTitle(document.title);
    }
  }, [document.title, renaming]);

  const commitTitle = () => {
    const nextTitle = draftTitle.trim();
    setRenaming(false);
    if (nextTitle) {
      void store.renameProject(nextTitle);
    }
  };

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
          {renaming ? (
            <input
              aria-label="Design name"
              autoFocus
              className="editor-header__title-input"
              maxLength={80}
              onBlur={commitTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  setDraftTitle(document.title);
                  setRenaming(false);
                }
              }}
              value={draftTitle}
            />
          ) : (
            <h1>
              <button
                aria-label="Rename design"
                className="editor-header__title-button"
                onClick={() => setRenaming(true)}
                type="button"
              >
                {document.title}
              </button>
            </h1>
          )}
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
