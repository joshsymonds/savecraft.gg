import type { Source } from "$lib/types/source";
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import SourceWindow from "./SourceWindow.svelte";

function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "test-source",
    name: "DAEMON · TEST-PC",
    sourceKind: "daemon",
    hostname: "test-pc",
    status: "online",
    version: "v0.1.0",
    lastSeen: "now",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [
      {
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        status: "watching",
        statusLine: "1 character",
        saves: [
          {
            saveUuid: "s1",
            saveName: "Hammerdin",
            summary: "Paladin · Level 89",
            lastUpdated: "2m ago",
            status: "success",
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("SourceWindow capability-aware buttons", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all three buttons when both capabilities are true", () => {
    render(SourceWindow, {
      props: { source: makeSource() },
    });

    expect(screen.getByText("DISCOVER")).toBeInTheDocument();
    expect(screen.getByText("RESCAN")).toBeInTheDocument();
    expect(screen.getByText("CONFIG")).toBeInTheDocument();
  });

  it("hides DISCOVER and RESCAN when canRescan is false", () => {
    render(SourceWindow, {
      props: {
        source: makeSource({
          capabilities: { canRescan: false, canReceiveConfig: true },
        }),
      },
    });

    expect(screen.queryByText("DISCOVER")).not.toBeInTheDocument();
    expect(screen.queryByText("RESCAN")).not.toBeInTheDocument();
    expect(screen.getByText("CONFIG")).toBeInTheDocument();
  });

  it("hides CONFIG when canReceiveConfig is false", () => {
    render(SourceWindow, {
      props: {
        source: makeSource({
          capabilities: { canRescan: true, canReceiveConfig: false },
        }),
      },
    });

    expect(screen.getByText("DISCOVER")).toBeInTheDocument();
    expect(screen.getByText("RESCAN")).toBeInTheDocument();
    expect(screen.queryByText("CONFIG")).not.toBeInTheDocument();
  });

  it("renders no action buttons when both capabilities are false", () => {
    const { container } = render(SourceWindow, {
      props: {
        source: makeSource({
          name: "PLUGIN · GAMING-RIG",
          sourceKind: "plugin",
          capabilities: { canRescan: false, canReceiveConfig: false },
        }),
      },
    });

    expect(screen.queryByText("DISCOVER")).not.toBeInTheDocument();
    expect(screen.queryByText("RESCAN")).not.toBeInTheDocument();
    expect(screen.queryByText("CONFIG")).not.toBeInTheDocument();
    expect(container.querySelector(".source-actions")).toBeNull();
  });
});
