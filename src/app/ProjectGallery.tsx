import { useEffect, useRef } from "react";
import type { ProjectSummary } from "../platform/persistence/types";
import type { EditorStore } from "../state/editorStore";

export type ProjectGalleryProps = Readonly<{
  projects: readonly ProjectSummary[];
  store: EditorStore;
}>;

export function ProjectGallery({ projects, store }: ProjectGalleryProps) {
  const storageStatusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    void store.loadProjects().catch(() => undefined);
  }, [store]);

  return (
    <main className="gallery-shell">
      <header className="gallery-header">
        <h1>Fabric Sketcher</h1>
        <button
          aria-describedby="storage-status"
          aria-label="Storage and capability status"
          className="icon-button"
          onClick={() => storageStatusRef.current?.focus()}
          type="button"
        >
          <SettingsIcon />
        </button>
      </header>
      <section className="gallery-content" aria-labelledby="recent-designs">
        <button
          className="primary-action"
          onClick={() => void store.createProject()}
          type="button"
        >
          <PlusIcon />
          <span>New blank design</span>
        </button>
        <h2 id="recent-designs">Recent designs</h2>
        {projects.length > 0 ? (
          <ul aria-label="Recent designs" className="project-grid">
            {projects.map((project) => (
              <li key={project.projectId}>
                <button
                  className="project-tile"
                  onClick={() => void store.openProject(project.projectId)}
                  type="button"
                >
                  <span aria-hidden="true" className="project-tile__sheet" />
                  <span className="project-tile__title">{project.title}</span>
                  <time
                    className="project-tile__date"
                    dateTime={project.updatedAt}
                  >
                    {formatProjectDate(project.updatedAt)}
                  </time>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <footer className="gallery-footer">
        <p id="storage-status" ref={storageStatusRef} tabIndex={-1}>
          Your work is saved on this iPad.
        </p>
      </footer>
    </main>
  );
}

function formatProjectDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      className="primary-action__icon"
      viewBox="0 0 24 24"
    >
      <path d="M12 4.5v15M4.5 12h15" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
      <path d="M9.8 3.2 10.4 1h3.2l.6 2.2 1.7.7 2-1.1 2.3 2.3-1.1 2 .7 1.7 2.2.6v3.2l-2.2.6-.7 1.7 1.1 2-2.3 2.3-2-1.1-1.7.7-.6 2.2h-3.2l-.6-2.2-1.7-.7-2 1.1-2.3-2.3 1.1-2-.7-1.7-2.2-.6V9.4l2.2-.6.7-1.7-1.1-2 2.3-2.3 2 1.1 1.7-.7Z" />
      <circle cx="12" cy="11" r="3.25" />
    </svg>
  );
}
