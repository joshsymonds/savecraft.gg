import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import ActivityEvent from "./ActivityEvent.svelte";

describe("ActivityEvent", () => {
  it("renders message text", () => {
    render(ActivityEvent, {
      props: {
        type: "daemon_online",
        message: "STEAM-DECK connected",
        time: "4h",
      },
    });

    expect(screen.getByText("STEAM-DECK connected")).toBeInTheDocument();
  });

  it("renders detail when provided", () => {
    render(ActivityEvent, {
      props: {
        type: "parse_success",
        message: "Parsed Hammerdin",
        detail: "Level 89 Paladin",
        time: "now",
      },
    });

    expect(screen.getByText("Level 89 Paladin")).toBeInTheDocument();
  });

  it("omits detail when not provided", () => {
    const { container } = render(ActivityEvent, {
      props: {
        type: "daemon_offline",
        message: "DESKTOP disconnected",
        time: "3h",
      },
    });

    expect(container.querySelector(".detail")).not.toBeInTheDocument();
  });

  it("shows correct icon for event type", () => {
    const { container } = render(ActivityEvent, {
      props: {
        type: "parse_error",
        message: "SharedStash.d2i failed",
        time: "1h",
      },
    });

    const icon = container.querySelector(".icon");
    expect(icon?.textContent).toBe("⚠");
  });

  it("renders time", () => {
    render(ActivityEvent, {
      props: {
        type: "watching",
        message: "Watching 5 files",
        time: "2m",
      },
    });

    expect(screen.getByText("2m")).toBeInTheDocument();
  });
});
