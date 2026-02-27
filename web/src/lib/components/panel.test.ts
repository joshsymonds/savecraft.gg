import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import Panel from "./Panel.svelte";

describe("Panel", () => {
  it("renders children", () => {
    render(Panel, {
      props: {
        children: (($$anchor: Comment) => {
          const el = document.createElement("p");
          el.textContent = "Hello panel";
          $$anchor.before(el);
        }) as any,
      },
    });

    expect(screen.getByText("Hello panel")).toBeInTheDocument();
  });

  it("renders four corner decorations", () => {
    const { container } = render(Panel, {
      props: {
        children: (($$anchor: Comment) => {
          const el = document.createElement("span");
          el.textContent = "test";
          $$anchor.before(el);
        }) as any,
      },
    });

    const corners = container.querySelectorAll(".corner");
    expect(corners).toHaveLength(4);
  });

  it("applies custom accent color", () => {
    const { container } = render(Panel, {
      props: {
        accent: "#ff0000",
        children: (($$anchor: Comment) => {
          const el = document.createElement("span");
          el.textContent = "accented";
          $$anchor.before(el);
        }) as any,
      },
    });

    const panel = container.querySelector<HTMLElement>(".panel")!;
    expect(panel.style.getPropertyValue("--panel-border")).toBe("#ff0000");
  });
});
