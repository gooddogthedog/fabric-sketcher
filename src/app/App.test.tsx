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
});
