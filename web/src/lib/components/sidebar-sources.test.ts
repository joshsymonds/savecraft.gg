import type { Source } from "$lib/types/source";
import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import SidebarSources from "./SidebarSources.svelte";

function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "src-1",
    name: "gaming-pc",
    sourceKind: "daemon",
    hostname: "GAMING-PC",
    platform: "linux",
    device: null,
    status: "online",
    version: "0.5.0",
    lastSeen: "2m ago",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [],
    ...overrides,
  };
}

describe("SidebarSources (#17 polish — compact computers block)", () => {
  afterEach(cleanup);

  it("renders the COMPUTERS label", () => {
    render(SidebarSources, { props: { sources: [makeSource()] } });
    expect(screen.getByText("COMPUTERS")).toBeInTheDocument();
  });

  it("renders a row per source", () => {
    render(SidebarSources, {
      props: {
        sources: [
          makeSource({ id: "a", hostname: "DECK" }),
          makeSource({ id: "b", hostname: "TOWER" }),
        ],
      },
    });
    expect(screen.getByText("DECK")).toBeInTheDocument();
    expect(screen.getByText("TOWER")).toBeInTheDocument();
  });

  it("calls oncardclick with the source when a row is clicked", async () => {
    const oncardclick = vi.fn();
    const source = makeSource({ id: "src-1", hostname: "DECK" });
    render(SidebarSources, { props: { sources: [source], oncardclick } });
    await userEvent.click(screen.getByText("DECK"));
    expect(oncardclick).toHaveBeenCalledExactlyOnceWith(source);
  });

  it("marks an offline source so it reads as inactive", () => {
    const { container } = render(SidebarSources, {
      props: { sources: [makeSource({ status: "offline" })] },
    });
    expect(container.querySelector(".computer-row.offline")).not.toBeNull();
  });
});
