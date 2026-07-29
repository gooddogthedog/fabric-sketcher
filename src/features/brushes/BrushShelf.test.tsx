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

    render(<BrushShelf store={store} />);

    await user.click(screen.getByRole("button", { name: "Brushes" }));
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

    render(<BrushShelf onOpenChange={onOpenChange} store={store} />);
    await user.click(screen.getByRole("button", { name: "Brushes" }));
    await user.click(screen.getByRole("button", { name: "Close brushes" }));

    expect(
      screen.queryByRole("radiogroup", { name: "Brush presets" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Brushes" }));
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("radiogroup", { name: "Brush presets" }),
    ).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    await user.click(screen.getByRole("button", { name: "Brushes" }));
    fireEvent.pointerDown(canvas);

    expect(
      screen.queryByRole("radiogroup", { name: "Brush presets" }),
    ).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    canvas.remove();
  });
});
