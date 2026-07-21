import { useSyncExternalStore } from "react";
import type { RendererSelection } from "../engine/render/createRenderer";
import { BrowserProjectRepository } from "../platform/persistence/BrowserProjectRepository";
import { MemoryProjectRepository } from "../platform/persistence/MemoryProjectRepository";
import { createEditorStore, type EditorStore } from "../state/editorStore";
import { EditorScreen } from "./EditorScreen";
import { ProjectGallery } from "./ProjectGallery";
import "./app.css";

export type AppProps = Readonly<{
  store?: EditorStore;
  rendererFactory?: (surface: HTMLCanvasElement) => RendererSelection;
}>;

const defaultStore = createEditorStore({
  repository:
    typeof globalThis.indexedDB === "undefined"
      ? new MemoryProjectRepository()
      : new BrowserProjectRepository(),
});

export function App({ store = defaultStore, rendererFactory }: AppProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  if (snapshot.view === "editor" && snapshot.document) {
    return (
      <EditorScreen
        document={snapshot.document}
        rendererFactory={rendererFactory}
        saveError={snapshot.saveError}
        saveStatus={snapshot.saveStatus}
        store={store}
      />
    );
  }

  return (
    <ProjectGallery
      navigationBusy={snapshot.navigationBusy}
      projects={snapshot.projects}
      store={store}
    />
  );
}
