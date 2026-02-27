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
        type: "parse_completed",
        message: "Atmus, Level 74 Warlock (Hell)",
        detail: "6 sections · 48KB",
        time: "now",
      },
    });

    expect(screen.getByText("6 sections · 48KB")).toBeInTheDocument();
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

  it("shows correct icon for parse_started", () => {
    const { container } = render(ActivityEvent, {
      props: {
        type: "parse_started",
        message: "Parsing Atmus.d2s",
        time: "now",
      },
    });

    const icon = container.querySelector(".icon");
    expect(icon?.textContent).toBe("◌");
  });

  it("shows correct icon for parse_failed", () => {
    const { container } = render(ActivityEvent, {
      props: {
        type: "parse_failed",
        message: "Corrupt.d2s — corrupt file",
        time: "1h",
      },
    });

    const icon = container.querySelector(".icon");
    expect(icon?.textContent).toBe("✕");
  });

  it("shows correct icon for plugin_status", () => {
    const { container } = render(ActivityEvent, {
      props: {
        type: "plugin_status",
        message: "45 items, 4 socketed",
        time: "now",
      },
    });

    const icon = container.querySelector(".icon");
    expect(icon?.textContent).toBe("»");
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
