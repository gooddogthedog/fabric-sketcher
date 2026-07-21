import "./app.css";

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      className="primary-action__icon"
      viewBox="0 0 24 24"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function App() {
  return (
    <main className="gallery-shell">
      <header className="app-header">
        <h1>Fabric Sketcher</h1>
        <button className="primary-action" type="button">
          <PlusIcon />
          <span>New blank design</span>
        </button>
      </header>

      <section
        aria-labelledby="recent-designs-heading"
        className="gallery-content"
      >
        <div className="gallery-heading-row">
          <h2 id="recent-designs-heading">Recent designs</h2>
          <button className="select-action" type="button">
            Select
          </button>
        </div>
        <p className="gallery-empty-state">Your work is saved on this iPad.</p>
      </section>
    </main>
  );
}
