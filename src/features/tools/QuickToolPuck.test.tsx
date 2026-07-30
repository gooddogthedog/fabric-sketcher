import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectRepository } from "../../platform/persistence/types";
import { createEditorStore } from "../../state/editorStore";
import { QuickToolPuck } from "./QuickToolPuck";

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

describe("QuickToolPuck", () => {
  it("switches between brush and eraser", async () => {
    const user = userEvent.setup();
    const store = createStore();

    render(<QuickToolPuck onOpenBrushes={vi.fn()} store={store} />);

    await user.click(screen.getByRole("button", { name: "Eraser" }));
    expect(store.getActiveTool()).toBe("eraser");
    expect(screen.getByRole("button", { name: "Eraser" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Brush" }));
    expect(store.getActiveTool()).toBe("brush");
    expect(screen.getByRole("button", { name: "Brush" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("opens the Brushes shelf from the current colour swatch", async () => {
    const user = userEvent.setup();
    const onOpenBrushes = vi.fn();

    render(
      <QuickToolPuck onOpenBrushes={onOpenBrushes} store={createStore()} />,
    );

    await user.click(screen.getByRole("button", { name: "Current color" }));
    expect(onOpenBrushes).toHaveBeenCalledTimes(1);
  });

  it("reflects the active brush colour on the swatch", () => {
    const store = createStore();
    store.setBrushColor("#2e4a3c");

    render(<QuickToolPuck onOpenBrushes={vi.fn()} store={store} />);

    expect(
      screen
        .getByRole("button", { name: "Current color" })
        .style.getPropertyValue("--puck-swatch"),
    ).toBe("#2e4a3c");
  });

  it("disables undo and redo until there is something to undo", () => {
    render(<QuickToolPuck onOpenBrushes={vi.fn()} store={createStore()} />);

    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("repositions with a touch drag on the move handle", () => {
    render(<QuickToolPuck onOpenBrushes={vi.fn()} store={createStore()} />);

    const handle = screen.getByRole("button", { name: "Move tools" });
    const puck = handle.closest(".quick-tool-puck") as HTMLElement;

    fireEvent.pointerDown(handle, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 100,
      clientY: 400,
    });
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 60,
      clientY: 300,
    });
    fireEvent.pointerUp(handle, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 60,
      clientY: 300,
    });

    expect(puck.style.getPropertyValue("--puck-offset-x")).toBe("-40px");
    expect(puck.style.getPropertyValue("--puck-offset-y")).toBe("-100px");
  });

  it("ignores pointer movement that never began on the handle", () => {
    render(<QuickToolPuck onOpenBrushes={vi.fn()} store={createStore()} />);

    const handle = screen.getByRole("button", { name: "Move tools" });
    const puck = handle.closest(".quick-tool-puck") as HTMLElement;

    fireEvent.pointerMove(handle, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 60,
      clientY: 300,
    });

    expect(puck.style.getPropertyValue("--puck-offset-x")).toBe("0px");
  });
});

describe("QuickToolPuck hub", () => {
  it("carries the chosen colour with a legible icon on light and dark", () => {
    const store = createStore();
    const { container, rerender } = render(
      <QuickToolPuck onOpenBrushes={vi.fn()} store={store} />,
    );
    const hub = () =>
      container.querySelector(".quick-tool-puck__hub") as HTMLElement;

    store.setBrushColor("#1a1a1a");
    rerender(<QuickToolPuck onOpenBrushes={vi.fn()} store={store} />);
    expect(hub().style.backgroundColor).toBe("rgb(26, 26, 26)");
    expect(hub().style.color).toBe("rgb(251, 250, 248)");

    store.setBrushColor("#f2e6a0");
    rerender(<QuickToolPuck onOpenBrushes={vi.fn()} store={store} />);
    expect(hub().style.backgroundColor).toBe("rgb(242, 230, 160)");
    expect(hub().style.color).toBe("rgb(38, 36, 33)");
  });
});
