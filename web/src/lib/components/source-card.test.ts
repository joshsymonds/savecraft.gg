import type { Source } from "$lib/types/source";
import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import SourceCard from "./SourceCard.svelte";

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

describe("SourceCard", () => {
  afterEach(cleanup);

  it("renders source name in uppercase", () => {
    render(SourceCard, { props: { source: makeSource() } });
    expect(screen.getByText("GAMING-PC")).toBeInTheDocument();
  });

  it("uses hostname for display name", () => {
    render(SourceCard, { props: { source: makeSource({ hostname: "my-deck" }) } });
    expect(screen.getByText("MY-DECK")).toBeInTheDocument();
  });

  it("falls back to name when hostname is null", () => {
    render(SourceCard, { props: { source: makeSource({ hostname: null, name: "fallback" }) } });
    expect(screen.getByText("FALLBACK")).toBeInTheDocument();
  });

  it("renders status text 'Online' for online sources", () => {
    render(SourceCard, { props: { source: makeSource({ status: "online" }) } });
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("renders status text 'Error' for error sources", () => {
    render(SourceCard, { props: { source: makeSource({ status: "error" }) } });
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("renders lastSeen as status text for offline sources", () => {
    render(SourceCard, {
      props: { source: makeSource({ status: "offline", lastSeen: "5h ago" }) },
    });
    expect(screen.getByText("5h ago")).toBeInTheDocument();
  });

  it("falls back to 'Offline' when offline with empty lastSeen", () => {
    render(SourceCard, { props: { source: makeSource({ status: "offline", lastSeen: "" }) } });
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("renders icon with correct src", () => {
    render(SourceCard, { props: { source: makeSource({ platform: "windows" }) } });
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe("/icons/sources/windows.png");
  });

  it("calls onclick when clicked", async () => {
    const onclick = vi.fn();
    render(SourceCard, { props: { source: makeSource(), onclick } });
    await userEvent.click(screen.getByText("GAMING-PC"));
    expect(onclick).toHaveBeenCalledOnce();
  });

  it("applies offline class when status is offline", () => {
    const { container } = render(SourceCard, {
      props: { source: makeSource({ status: "offline" }) },
    });
    expect(container.querySelector(".source-card.offline")).toBeInTheDocument();
  });

  it("applies error class when status is error", () => {
    const { container } = render(SourceCard, {
      props: { source: makeSource({ status: "error" }) },
    });
    expect(container.querySelector(".source-card.error")).toBeInTheDocument();
  });

  it("renders 'Linked' with freshness for adapter sources", () => {
    render(SourceCard, {
      props: {
        source: makeSource({
          sourceKind: "adapter",
          status: "linked",
          lastSeen: "3m ago",
        }),
      },
    });
    expect(screen.getByText("Linked · 3m ago")).toBeInTheDocument();
  });

  it("renders 'Linked' without freshness when lastSeen is empty", () => {
    render(SourceCard, {
      props: {
        source: makeSource({
          sourceKind: "adapter",
          status: "linked",
          lastSeen: "",
        }),
      },
    });
    expect(screen.getByText("Linked")).toBeInTheDocument();
  });

  it("does not apply offline class for linked adapter sources", () => {
    const { container } = render(SourceCard, {
      props: {
        source: makeSource({
          sourceKind: "adapter",
          status: "linked",
        }),
      },
    });
    expect(container.querySelector(".source-card.offline")).not.toBeInTheDocument();
  });
});
