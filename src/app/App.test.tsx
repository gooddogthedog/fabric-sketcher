import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDocument } from "../domain/document/createDocument";
import type { Renderer } from "../engine/render/Renderer";
import type { RendererSelection } from "../engine/render/createRenderer";
import type { ProjectRepository } from "../platform/persistence/types";
import { createEditorStore } from "../state/editorStore";
import { App } from "./App";

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
});
