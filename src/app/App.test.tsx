// @ts-expect-error -- Vitest executes under Node; the app build intentionally
// omits Node types.
import { readFileSync } from "node:fs";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDocument } from "../domain/document/createDocument";
import { documentReducer } from "../domain/document/documentReducer";
import { createFoundationState } from "../domain/document/foundationState";
import { getBrushPreset } from "../engine/brush/presets";
import type { Renderer } from "../engine/render/Renderer";
import type { RendererSelection } from "../engine/render/createRenderer";
import type { ProjectRepository } from "../platform/persistence/types";
import { createEditorStore } from "../state/editorStore";
import { App } from "./App";

const PROJECT_DIRECTORY = (
  globalThis as typeof globalThis & {
    process: { cwd(): string };
  }
).process.cwd();
const APP_STYLES = readFileSync(`${PROJECT_DIRECTORY}/src/app/app.css`, "utf8");

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderer(): Renderer {
  return {
    kind: "webgl2",
    resize: vi.fn(),
    setViewport: vi.fn(),
    replaceDocument: vi.fn(),
    previewStroke: vi.fn(),
    commitStroke: vi.fn(),
    clearPreview: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  };
}

function rendererFactory(): (canvas: HTMLCanvasElement) => RendererSelection {
  return (canvas) => ({
    renderer: renderer(),
    surface: canvas,
    fallbackReason: null,
  });
}

function repository(
  overrides: Partial<ProjectRepository> = {},
): ProjectRepository {
  return {
    listProjects: vi.fn(async () => [
      {
        projectId: "recent",
        title: "Recent design",
        createdAt: "2026-07-20T10:00:00.000Z",
        updatedAt: "2026-07-21T10:00:00.000Z",
        width: 2480,
        height: 3508,
      },
      {
        projectId: "older",
        title: "Older design",
        createdAt: "2026-07-18T10:00:00.000Z",
        updatedAt: "2026-07-19T10:00:00.000Z",
        width: 2480,
        height: 3508,
      },
    ]),
    createProject: vi.fn(async () => undefined),
    loadProject: vi.fn(async (projectId) =>
      createDocument({
        projectId,
        title: projectId === "recent" ? "Recent design" : "Older design",
      }),
    ),
    appendOperation: vi.fn(async () => undefined),
    writeSnapshot: vi.fn(async () => undefined),
    deleteProject: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("App", () => {
  it("keeps the visible save Retry target at least 56 pixels square", async () => {
    const style = document.createElement("style");
    style.textContent = APP_STYLES;
    document.head.append(style);
    const projectRepository = repository({
      appendOperation: vi.fn(async () => {
        throw new Error("Local save failed");
      }),
    });
    const store = createEditorStore({ repository: projectRepository });
    const user = userEvent.setup();
    render(<App rendererFactory={rendererFactory()} store={store} />);

    try {
      await waitFor(() =>
        expect(screen.getByText("Recent design")).toBeVisible(),
      );
      await user.click(screen.getByRole("button", { name: /Recent design/ }));
      await user.click(screen.getByRole("button", { name: "Layers" }));
      await user.click(screen.getByRole("button", { name: "Add foundation" }));
      await user.click(
        screen.getByRole("button", { name: "Neutral figure — Front" }),
      );

      const retry = await screen.findByRole("button", { name: "Retry save" });
      const computed = getComputedStyle(retry);
      expect(Number.parseFloat(computed.minWidth)).toBeGreaterThanOrEqual(56);
      expect(Number.parseFloat(computed.minHeight)).toBeGreaterThanOrEqual(56);
    } finally {
      style.remove();
    }
  });

  it("presents the repository-ordered editorial gallery and local storage access", async () => {
    const store = createEditorStore({ repository: repository() });
    render(<App store={store} />);

    expect(
      screen.getByRole("heading", { name: "Fabric Sketcher" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "New blank design" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("heading", { name: "Recent designs" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByText("Recent design")).toBeVisible(),
    );

    const gallery = screen.getByRole("list", { name: "Recent designs" });
    const projects = within(gallery).getAllByRole("button");
    expect(projects.map((project) => project.textContent)).toEqual([
      expect.stringContaining("Recent design"),
      expect.stringContaining("Older design"),
    ]);

    const statusAccess = screen.getByRole("button", {
      name: "Storage and capability status",
    });
    await userEvent.click(statusAccess);
    expect(screen.getByText("Your work is saved on this iPad.")).toHaveFocus();
  });

  it("keeps the gallery visible until a new blank project is durable", async () => {
    const persistence = deferred<void>();
    const projectRepository = repository({
      createProject: vi.fn(() => persistence.promise),
      listProjects: vi.fn(async () => []),
    });
    const store = createEditorStore({
      repository: projectRepository,
      createId: () => "new-project",
    });
    const user = userEvent.setup();
    render(<App rendererFactory={rendererFactory()} store={store} />);

    await user.click(screen.getByRole("button", { name: "New blank design" }));
    expect(
      screen.getByRole("heading", { name: "Fabric Sketcher" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "New blank design" }),
    ).toBeDisabled();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");

    await act(async () => persistence.resolve());

    expect(
      await screen.findByRole("heading", { name: "Untitled Design" }),
    ).toBeVisible();
    expect(screen.getByText("Saved on this iPad")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens an existing project from its gallery sheet", async () => {
    const store = createEditorStore({ repository: repository() });
    const user = userEvent.setup();
    render(<App rendererFactory={rendererFactory()} store={store} />);
    await waitFor(() =>
      expect(screen.getByText("Recent design")).toBeVisible(),
    );

    await user.click(screen.getByRole("button", { name: /Recent design/ }));

    expect(
      await screen.findByRole("heading", { name: "Recent design" }),
    ).toBeVisible();
    expect(
      screen.getByLabelText("Drawing canvas for Recent design"),
    ).toHaveFocus();
  });

  it("renames a design from the editor header", async () => {
    const projectRepository = repository();
    const store = createEditorStore({ repository: projectRepository });
    const user = userEvent.setup();
    render(<App rendererFactory={rendererFactory()} store={store} />);

    await waitFor(() =>
      expect(screen.getByText("Recent design")).toBeVisible(),
    );
    await user.click(screen.getByRole("button", { name: /Recent design/ }));
    await user.click(screen.getByRole("button", { name: "Rename design" }));

    const title = screen.getByRole("textbox", { name: "Design name" });
    await user.clear(title);
    await user.type(title, "Linen Wrap Study");
    await user.keyboard("{Enter}");

    expect(
      await screen.findByRole("heading", { name: "Linen Wrap Study" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(projectRepository.appendOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "document.title-set",
          title: "Linen Wrap Study",
        }),
      ),
    );
  });

  it("opens recovered artwork when its pinned Foundation asset is unavailable", async () => {
    const initial = createDocument({
      projectId: "recent",
      title: "Recovered design",
    });
    const withUnavailableFoundation = documentReducer(initial, {
      type: "foundation.set",
      operationId: "retired-foundation",
      projectId: "recent",
      sequence: 1,
      committedAt: "2026-07-28T12:00:00.000Z",
      foundation: {
        ...createFoundationState({
          assetId: "retired-foundation",
          assetVersion: 9,
          foundationType: "figure",
          visibleLandmarkGroups: ["outline", "center"],
        }),
        transform: [0.82, 0, 180, 0, 0.82, 240, 0, 0, 1],
      },
    });
    const recovered = documentReducer(withUnavailableFoundation, {
      type: "stroke.committed",
      operationId: "recovered-denim-stroke",
      projectId: "recent",
      layerId: initial.activeLayerId,
      sequence: 2,
      committedAt: "2026-07-28T12:01:00.000Z",
      brush: getBrushPreset("denim-v1"),
      samples: [
        {
          x: 720,
          y: 920,
          pressure: 0.6,
          tiltX: 0,
          tiltY: 0,
          twist: 0,
          altitudeAngle: null,
          azimuthAngle: null,
          time: 0,
        },
        {
          x: 820,
          y: 1020,
          pressure: 0.7,
          tiltX: 0,
          tiltY: 0,
          twist: 0,
          altitudeAngle: null,
          azimuthAngle: null,
          time: 16,
        },
      ],
    });
    const activeRenderer = renderer();
    const store = createEditorStore({
      repository: repository({
        loadProject: vi.fn(async () => recovered),
      }),
    });
    const user = userEvent.setup();
    render(
      <App
        rendererFactory={(canvas) => ({
          renderer: activeRenderer,
          surface: canvas,
          fallbackReason: null,
        })}
        store={store}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Recent design")).toBeVisible(),
    );

    await user.click(screen.getByRole("button", { name: /Recent design/ }));

    expect(
      await screen.findByRole("heading", { name: "Recovered design" }),
    ).toBeVisible();
    expect(activeRenderer.replaceDocument).toHaveBeenCalledWith([
      expect.objectContaining({ operationId: "recovered-denim-stroke" }),
    ]);
    expect(screen.getByLabelText("Drawing canvas for Recovered design")).toBe(
      document.activeElement,
    );
  });
});
