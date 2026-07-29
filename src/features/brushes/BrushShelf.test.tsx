import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorStore } from "../../state/editorStore";
import type { ProjectRepository } from "../../platform/persistence/types";
import { getBrushPreset } from "../../engine/brush/presets";
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

  it("edits size, opacity, and color from the open shelf", async () => {
    const user = userEvent.setup();
    const store = createStore();

    render(<BrushShelf open onOpenChange={vi.fn()} store={store} />);

    fireEvent.change(screen.getByRole("slider", { name: "Brush size" }), {
      target: { value: "88" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "Brush opacity" }), {
      target: { value: "0.3" },
    });
    fireEvent.change(screen.getByLabelText("Brush color"), {
      target: { value: "#2e4a3c" },
    });

    expect(store.getActiveBrush().size).toBe(88);
    expect(store.getActiveBrush().opacity).toBe(0.3);
    expect(store.getActiveBrush().color).toBe("#2e4a3c");

    await user.click(
      screen.getByRole("button", { name: "Reset brush to preset" }),
    );

    expect(store.getActiveBrush()).toEqual(getBrushPreset("studio-pencil-v1"));
  });

  it("reapplies a recent color without reopening the color control", async () => {
    const user = userEvent.setup();
    const store = createStore();

    render(<BrushShelf open onOpenChange={vi.fn()} store={store} />);

    fireEvent.change(screen.getByLabelText("Brush color"), {
      target: { value: "#2e4a3c" },
    });
    fireEvent.change(screen.getByLabelText("Brush color"), {
      target: { value: "#7a1f2b" },
    });
    await user.click(screen.getByRole("button", { name: "Use color #2e4a3c" }));

    expect(store.getActiveBrush().color).toBe("#2e4a3c");
  });

  it("preserves the preset texture through a color change", () => {
    const store = createStore();

    render(<BrushShelf open onOpenChange={vi.fn()} store={store} />);

    fireEvent.click(screen.getByRole("radio", { name: "Denim" }));
    fireEvent.change(screen.getByLabelText("Brush color"), {
      target: { value: "#2e4a3c" },
    });

    expect(store.getActiveBrush().texture).toEqual(
      getBrushPreset("denim-v1").texture,
    );
  });
});
