import type { Source } from "$lib/types/source";
import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import SourceCardGrid from "./SourceCardGrid.svelte";

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

describe("SourceCardGrid", () => {
  afterEach(cleanup);

  it("renders SOURCES label", () => {
    render(SourceCardGrid, { props: { sources: [] } });
    expect(screen.getByText("SOURCES")).toBeInTheDocument();
  });

  it("renders a SourceCard for each source", () => {
    const sources = [
      makeSource({ id: "src-1", hostname: "DECK" }),
      makeSource({ id: "src-2", hostname: "PC" }),
    ];
    render(SourceCardGrid, { props: { sources } });
    expect(screen.getByText("DECK")).toBeInTheDocument();
    expect(screen.getByText("PC")).toBeInTheDocument();
  });

  it("always renders AddSourceCard", () => {
    render(SourceCardGrid, { props: { sources: [] } });
    expect(screen.getByText("ADD SOURCE")).toBeInTheDocument();
  });

  it("calls oncardclick with the source when a card is clicked", async () => {
    const oncardclick = vi.fn();
    const source = makeSource({ id: "src-1", hostname: "DECK" });
    render(SourceCardGrid, { props: { sources: [source], oncardclick } });
    await userEvent.click(screen.getByText("DECK"));
    expect(oncardclick).toHaveBeenCalledOnce();
    expect(oncardclick).toHaveBeenCalledWith(source);
  });

  it("calls onadd when AddSourceCard is clicked", async () => {
    const onadd = vi.fn();
    render(SourceCardGrid, { props: { sources: [], onadd } });
    await userEvent.click(screen.getByText("ADD SOURCE"));
    expect(onadd).toHaveBeenCalledOnce();
  });
});
