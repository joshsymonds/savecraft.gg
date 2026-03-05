import type { Source } from "$lib/types/source";
import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import SourceDetailModal from "./SourceDetailModal.svelte";

function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "src-1",
    name: "gaming-pc",
    sourceKind: "daemon",
    hostname: "GAMING-PC",
    status: "online",
    version: "0.5.0",
    lastSeen: "2m ago",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [],
    ...overrides,
  };
}

describe("SourceDetailModal", () => {
  afterEach(cleanup);

  it("renders source hostname as title", () => {
    render(SourceDetailModal, { props: { source: makeSource() } });
    expect(screen.getByText("GAMING-PC")).toBeInTheDocument();
  });

  it("renders source kind badge", () => {
    render(SourceDetailModal, { props: { source: makeSource() } });
    expect(screen.getByText("daemon")).toBeInTheDocument();
  });

  it("renders status, last seen, and version", () => {
    render(SourceDetailModal, { props: { source: makeSource() } });
    expect(screen.getByText("ONLINE")).toBeInTheDocument();
    expect(screen.getByText("2m ago")).toBeInTheDocument();
    expect(screen.getByText("0.5.0")).toBeInTheDocument();
  });

  it("shows error section when games have errors", () => {
    const source = makeSource({
      games: [
        {
          gameId: "d2r",
          name: "Diablo II: Resurrected",
          status: "error",
          statusLine: "",
          saves: [],
          error: "Path not found",
        },
      ],
    });
    render(SourceDetailModal, { props: { source } });
    expect(screen.getByText("ERRORS")).toBeInTheDocument();
    expect(screen.getByText("Path not found")).toBeInTheDocument();
  });

  it("shows game config section for daemon sources", () => {
    const source = makeSource({
      games: [
        {
          gameId: "d2r",
          name: "Diablo II: Resurrected",
          status: "watching",
          statusLine: "1 save",
          saves: [
            {
              saveUuid: "s1",
              saveName: "Atmus",
              summary: "Paladin",
              lastUpdated: "now",
              status: "success",
            },
          ],
        },
      ],
    });
    render(SourceDetailModal, { props: { source } });
    expect(screen.getByText("GAME CONFIGURATION")).toBeInTheDocument();
    expect(screen.getByText("Diablo II: Resurrected")).toBeInTheDocument();
    expect(screen.getByText("WATCHING")).toBeInTheDocument();
    expect(screen.getByText("1 save")).toBeInTheDocument();
  });

  it("hides config section when source cannot receive config", () => {
    const source = makeSource({
      capabilities: { canRescan: false, canReceiveConfig: false },
    });
    render(SourceDetailModal, { props: { source } });
    expect(screen.queryByText("GAME CONFIGURATION")).not.toBeInTheDocument();
  });

  it("calls onclose on close button click", async () => {
    const onclose = vi.fn();
    render(SourceDetailModal, { props: { source: makeSource(), onclose } });
    await userEvent.click(screen.getByText("✕"));
    expect(onclose).toHaveBeenCalledOnce();
  });

  it("uses name when hostname is null", () => {
    render(SourceDetailModal, { props: { source: makeSource({ hostname: null, name: "api-src" }) } });
    expect(screen.getByText("API-SRC")).toBeInTheDocument();
  });
});
