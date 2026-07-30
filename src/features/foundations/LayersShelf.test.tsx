import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocument } from "../../domain/document/createDocument";
import { createFoundationState } from "../../domain/document/foundationState";
import type { DesignDocument } from "../../domain/document/types";
import type { ProjectRepository } from "../../platform/persistence/types";
import { createEditorStore } from "../../state/editorStore";
import { LayersShelf } from "./LayersShelf";

afterEach(cleanup);

function repositoryFor(
  document: DesignDocument = createDocument({
    projectId: "project-1",
    title: "Untitled Design",
  }),
) {
  return {
    listProjects: vi.fn(async () => []),
    createProject: vi.fn(async () => undefined),
    loadProject: vi.fn(async () => document),
    appendOperation: vi.fn(async () => undefined),
    writeSnapshot: vi.fn(async () => undefined),
    deleteProject: vi.fn(async () => undefined),
  } satisfies ProjectRepository;
}

async function createStore(document?: DesignDocument) {
  const repository = repositoryFor(document);
  const store = createEditorStore({
    repository,
    createId: () => "foundation-operation",
    now: () => "2026-07-29T12:00:00.000Z",
  });
  await store.openProject(document?.projectId ?? "project-1");
  return { repository, store };
}

async function storeWithFigure() {
  const initial = {
    ...createDocument({ projectId: "project-1", title: "Untitled Design" }),
    foundation: createFoundationState({
      assetId: "neutral-figure-front",
      assetVersion: 1,
      foundationType: "figure",
      visibleLandmarkGroups: ["outline", "center"],
    }),
  };
  return createStore(initial);
}

describe("LayersShelf", () => {
  it("shows only real Foundation and Artwork rows", async () => {
    const { store } = await createStore();

    render(<LayersShelf open onOpenChange={vi.fn()} store={store} />);

    expect(screen.getByText("Foundation")).toBeVisible();
    expect(screen.getByText("None")).toBeVisible();
    expect(screen.getByText("Artwork")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Add foundation" }),
    ).toBeVisible();
    expect(screen.queryByText("Mask")).toBeNull();
  });

  it("adds either catalog asset from a compact native-SVG picker", async () => {
    const user = userEvent.setup();
    const { repository, store } = await createStore();
    render(<LayersShelf open onOpenChange={vi.fn()} store={store} />);

    await user.click(screen.getByRole("button", { name: "Add foundation" }));

    const figure = screen.getByRole("button", {
      name: "Neutral figure — Front",
    });
    const dressForm = screen.getByRole("button", {
      name: "Professional dress form — Front",
    });
    expect(figure.querySelector("svg")).not.toBeNull();
    expect(dressForm.querySelector("svg")).not.toBeNull();

    await user.click(figure);

    await waitFor(() =>
      expect(repository.appendOperation).toHaveBeenCalledOnce(),
    );
    expect(store.getSnapshot().document?.foundation).toMatchObject({
      assetId: "neutral-figure-front",
      assetVersion: 1,
      opacity: 0.35,
    });
    expect(
      screen.getByRole("slider", { name: "Foundation opacity" }),
    ).toHaveValue("0.35");
    expect(screen.getByText("35%")).toBeVisible();
  });

  it("journals each accepted button and checkbox edit exactly once", async () => {
    const user = userEvent.setup();
    const { repository, store } = await storeWithFigure();
    render(<LayersShelf open onOpenChange={vi.fn()} store={store} />);
    repository.appendOperation.mockClear();

    await user.click(screen.getByRole("button", { name: "Hide foundation" }));
    await waitFor(() =>
      expect(repository.appendOperation).toHaveBeenCalledOnce(),
    );
    expect(store.getSnapshot().document?.foundation?.visible).toBe(false);
    repository.appendOperation.mockClear();

    await user.click(screen.getByRole("button", { name: "Unlock foundation" }));
    await waitFor(() =>
      expect(repository.appendOperation).toHaveBeenCalledOnce(),
    );
    expect(store.getSnapshot().document?.foundation?.locked).toBe(false);
    repository.appendOperation.mockClear();

    await user.click(screen.getByRole("checkbox", { name: "Body levels" }));
    await waitFor(() =>
      expect(repository.appendOperation).toHaveBeenCalledOnce(),
    );
    expect(
      store.getSnapshot().document?.foundation?.visibleLandmarkGroups,
    ).toContain("levels");
    repository.appendOperation.mockClear();

    await user.click(screen.getByRole("button", { name: "Flip horizontally" }));
    await waitFor(() =>
      expect(repository.appendOperation).toHaveBeenCalledOnce(),
    );
    expect(store.getSnapshot().document?.foundation?.transform[0]).toBe(-1);
    repository.appendOperation.mockClear();

    await user.click(screen.getByRole("button", { name: "Remove foundation" }));
    await waitFor(() =>
      expect(repository.appendOperation).toHaveBeenCalledOnce(),
    );
    expect(store.getSnapshot().document?.foundation).toBeNull();
  });

  it("previews opacity changes locally and journals one value per gesture", async () => {
    const { repository, store } = await storeWithFigure();
    render(<LayersShelf open onOpenChange={vi.fn()} store={store} />);
    repository.appendOperation.mockClear();
    const opacity = screen.getByRole("slider", {
      name: "Foundation opacity",
    });
    expect(screen.getByText("Opacity")).toBeVisible();
    expect(screen.getByText("Scale")).toBeVisible();

    fireEvent.change(opacity, { target: { value: "0.45" } });
    fireEvent.change(opacity, { target: { value: "0.55" } });
    fireEvent.change(opacity, { target: { value: "0.65" } });

    expect(opacity).toHaveValue("0.65");
    expect(screen.getByText("65%")).toBeVisible();
    expect(repository.appendOperation).not.toHaveBeenCalled();
    expect(store.getSnapshot().document?.foundation?.opacity).toBe(0.35);

    fireEvent.pointerUp(opacity);
    fireEvent.blur(opacity);

    await waitFor(() =>
      expect(repository.appendOperation).toHaveBeenCalledOnce(),
    );
    expect(store.getSnapshot().document?.foundation?.opacity).toBe(0.65);
  });

  it("journals scale once across keyboard release and blur", async () => {
    const { repository, store } = await storeWithFigure();
    render(<LayersShelf open onOpenChange={vi.fn()} store={store} />);
    repository.appendOperation.mockClear();
    const scale = screen.getByRole("slider", { name: "Foundation scale" });

    fireEvent.change(scale, { target: { value: "1.5" } });
    expect(repository.appendOperation).not.toHaveBeenCalled();
    fireEvent.keyUp(scale, { key: "ArrowRight" });
    fireEvent.blur(scale);

    await waitFor(() =>
      expect(repository.appendOperation).toHaveBeenCalledOnce(),
    );
    expect(
      Math.hypot(
        store.getSnapshot().document!.foundation!.transform[0],
        store.getSnapshot().document!.foundation!.transform[3],
      ),
    ).toBeCloseTo(1.5);
  });

  it("replaces an existing asset without losing its editing state", async () => {
    const user = userEvent.setup();
    const { repository, store } = await storeWithFigure();
    render(<LayersShelf open onOpenChange={vi.fn()} store={store} />);
    repository.appendOperation.mockClear();

    await user.click(
      screen.getByRole("button", { name: "Replace foundation" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Professional dress form — Front",
      }),
    );

    await waitFor(() =>
      expect(repository.appendOperation).toHaveBeenCalledOnce(),
    );
    expect(store.getSnapshot().document?.foundation).toMatchObject({
      assetId: "dress-form-front",
      assetVersion: 1,
      locked: true,
      opacity: 0.35,
      visibleLandmarkGroups: ["outline", "center"],
    });
  });

  it("offers recovery without a broken thumbnail for an unavailable asset", async () => {
    const unavailable = {
      ...createDocument({ projectId: "project-1", title: "Untitled Design" }),
      foundation: {
        ...createFoundationState({
          assetId: "retired-foundation",
          assetVersion: 3,
          foundationType: "figure",
          visibleLandmarkGroups: ["outline"],
        }),
        locked: false,
      },
    };
    const { store } = await createStore(unavailable);
    const view = render(
      <LayersShelf open onOpenChange={vi.fn()} store={store} />,
    );

    expect(screen.getByText("Foundation unavailable")).toBeVisible();
    expect(screen.getByText("Your artwork is safe.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Replace foundation" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remove foundation" }),
    ).toBeVisible();
    expect(view.container.querySelector("img")).toBeNull();
    expect(screen.getByText("Artwork")).toBeVisible();
  });

  it("requests closure on Escape and canvas contact", async () => {
    const user = userEvent.setup();
    const { store } = await createStore();
    const onOpenChange = vi.fn();
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    render(<LayersShelf open onOpenChange={onOpenChange} store={store} />);

    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    onOpenChange.mockClear();

    fireEvent.pointerDown(canvas);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    canvas.remove();
  });

  it.each(["Escape", "canvas contact"] as const)(
    "cancels a pending range preview without journaling on %s dismissal",
    async (dismissal) => {
      const user = userEvent.setup();
      const { repository, store } = await storeWithFigure();
      const onPreviewFoundation = vi.fn();
      const canvas = document.createElement("canvas");
      document.body.append(canvas);

      function Harness() {
        const [open, setOpen] = useState(true);
        return (
          <LayersShelf
            onOpenChange={setOpen}
            onPreviewFoundation={onPreviewFoundation}
            open={open}
            store={store}
          />
        );
      }

      render(<Harness />);
      repository.appendOperation.mockClear();
      fireEvent.change(
        screen.getByRole("slider", { name: "Foundation opacity" }),
        { target: { value: "0.65" } },
      );
      expect(onPreviewFoundation).toHaveBeenLastCalledWith(
        expect.objectContaining({ opacity: 0.65 }),
      );
      expect(repository.appendOperation).not.toHaveBeenCalled();

      if (dismissal === "Escape") {
        await user.keyboard("{Escape}");
      } else {
        fireEvent.pointerDown(canvas);
      }

      expect(
        screen.queryByRole("complementary", { name: "Layers" }),
      ).toBeNull();
      expect(onPreviewFoundation).toHaveBeenLastCalledWith(null);
      expect(repository.appendOperation).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Layers" }));
      expect(screen.getByText("35%")).toBeVisible();
      expect(repository.appendOperation).not.toHaveBeenCalled();
      canvas.remove();
    },
  );
});

describe("LayersShelf range release", () => {
  it("commits a dragged range when the pointer is released off the thumb", async () => {
    const { repository, store } = await storeWithFigure();
    render(<LayersShelf onOpenChange={vi.fn()} open store={store} />);
    repository.appendOperation.mockClear();

    const opacity = screen.getByRole("slider", { name: "Foundation opacity" });
    fireEvent.change(opacity, { target: { value: "0.55" } });
    // No pointerup on the input: the drag ended elsewhere on the page.
    fireEvent.lostPointerCapture(opacity, { pointerId: 1 });

    await waitFor(() => {
      expect(repository.appendOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "foundation.set",
          foundation: expect.objectContaining({ opacity: 0.55 }),
        }),
      );
    });
  });
});
