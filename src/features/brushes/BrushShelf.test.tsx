import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorStore } from "../../state/editorStore";
import type { ProjectRepository } from "../../platform/persistence/types";
import { BrushShelf } from "./BrushShelf";

afterEach(cleanup);

function createStore() {
  const repository: ProjectRepository = {
    listProjects: vi.fn(async () => []),
    createProject: vi.fn(async () => undefined),
    loadProject: vi.fn(),
    appendOperation: vi.fn(async () => undefined),
    writeSnapshot: vi.fn(async () => undefined),
    deleteProject: vi.fn(async () => undefined),
  };
  return createEditorStore({ repository });
}

describe("BrushShelf", () => {
  it("selects a preset from the open shelf without closing comparison", async () => {
    const user = userEvent.setup();
    const store = createStore();
    const onOpenChange = vi.fn();

    const view = render(
      <BrushShelf open={false} onOpenChange={onOpenChange} store={store} />,
    );

    await user.click(screen.getByRole("button", { name: "Brushes" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    view.rerender(
      <BrushShelf open onOpenChange={onOpenChange} store={store} />,
    );
    expect(
      screen.getByRole("radiogroup", { name: "Brush presets" }),
    ).toBeVisible();

    await user.click(screen.getByRole("radio", { name: "Denim" }));

    expect(store.getActiveBrush().id).toBe("denim-v1");
    expect(screen.getByRole("radio", { name: "Denim" })).toBeChecked();
    expect(screen.getByText("Denim")).toBeVisible();
    expect(
      screen.getByRole("radiogroup", { name: "Brush presets" }),
    ).toBeVisible();
  });

  it("closes on Escape and canvas contact", async () => {
    const user = userEvent.setup();
    const store = createStore();
    const onOpenChange = vi.fn();
    const canvas = document.createElement("canvas");
    document.body.append(canvas);

    const view = render(
      <BrushShelf open onOpenChange={onOpenChange} store={store} />,
    );
    await user.click(screen.getByRole("button", { name: "Close brushes" }));

    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    onOpenChange.mockClear();
    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    onOpenChange.mockClear();
    fireEvent.pointerDown(canvas);

    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    canvas.remove();
    view.unmount();
  });
});
