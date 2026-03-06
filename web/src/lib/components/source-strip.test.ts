import type { Source } from "$lib/types/source";
import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import SourceStrip from "./SourceStrip.svelte";

function makeSource(overrides: Partial<Source> & { id: string }): Source {
  return {
    name: overrides.id,
    sourceKind: "daemon",
    hostname: overrides.id.toUpperCase(),
    status: "online",
    version: "0.1.0",
    lastSeen: "now",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [],
    ...overrides,
  };
}

describe("SourceStrip", () => {
  afterEach(cleanup);

  it("renders SOURCES label", () => {
    render(SourceStrip, { props: { sources: [makeSource({ id: "src-1" })] } });
    expect(screen.getByText("SOURCES")).toBeInTheDocument();
  });

  it("renders a chip for each source", () => {
    const sources = [
      makeSource({ id: "src-1", hostname: "STEAM-DECK" }),
      makeSource({ id: "src-2", hostname: "DESKTOP-PC" }),
    ];
    render(SourceStrip, { props: { sources } });
    expect(screen.getByText("STEAM-DECK")).toBeInTheDocument();
    expect(screen.getByText("DESKTOP-PC")).toBeInTheDocument();
  });

  it("calls onchipclick with source when chip is clicked", async () => {
    const onchipclick = vi.fn();
    const source = makeSource({ id: "src-1", hostname: "STEAM-DECK" });
    render(SourceStrip, { props: { sources: [source], onchipclick } });
    await userEvent.click(screen.getByText("STEAM-DECK"));
    expect(onchipclick).toHaveBeenCalledExactlyOnceWith(source);
  });

  it("uses name when hostname is null", () => {
    const source = makeSource({ id: "src-1", hostname: null, name: "my-daemon" });
    render(SourceStrip, { props: { sources: [source] } });
    expect(screen.getByText("MY-DAEMON")).toBeInTheDocument();
  });

  it("renders add source button", () => {
    render(SourceStrip, { props: { sources: [makeSource({ id: "src-1" })] } });
    expect(screen.getByText("+ ADD SOURCE")).toBeInTheDocument();
  });

  it("calls onadd when add source button is clicked", async () => {
    const onadd = vi.fn();
    render(SourceStrip, { props: { sources: [makeSource({ id: "src-1" })], onadd } });
    await userEvent.click(screen.getByText("+ ADD SOURCE"));
    expect(onadd).toHaveBeenCalledExactlyOnceWith();
  });
});
