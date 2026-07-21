import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("opens on the project gallery with an immediate create action", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /fabric sketcher/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /new blank design/i }),
    ).toBeEnabled();
  });

  it("does not expose unavailable project or persistence controls", () => {
    render(<App />);

    expect(
      screen.queryByRole("heading", { name: /recent designs/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /select/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/your work is saved on this iPad/i),
    ).not.toBeInTheDocument();
  });
});
