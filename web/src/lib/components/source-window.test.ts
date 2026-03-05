import type { Source } from "$lib/types/source";
import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/api/client", () => ({
  fetchSourceConfig: vi.fn().mockResolvedValue({
    d2r: { savePath: "/saves/d2r", enabled: true, fileExtensions: [".d2s", ".d2i"] },
  }),
  saveSourceConfig: vi.fn().mockResolvedValue(null),
}));

vi.mock("$lib/ws/client", () => ({
  send: vi.fn(),
  connectionStatus: {
    subscribe: vi.fn((callback: (v: string) => void) => {
      callback("connected");
      return () => {
        /* unsubscribe */
      };
    }),
  },
}));

vi.mock("$lib/stores/testpath", async () => {
  const { writable } = await import("svelte/store");
  const store = writable<unknown>(null);
  return {
    testPathResult: { subscribe: store.subscribe },
    clearTestPathResult: vi.fn(() => {
      store.set(null);
    }),
    setTestPathResult: vi.fn((v: unknown) => {
      store.set(v);
    }),
  };
});

const { saveSourceConfig } = await import("$lib/api/client");
const { send } = await import("$lib/ws/client");

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
    vi.clearAllMocks();
  });

  it("renders RESCAN button when canRescan is true", () => {
    render(SourceWindow, {
      props: { source: makeSource() },
    });

    expect(screen.getByText("RESCAN")).toBeInTheDocument();
    expect(screen.queryByText("DISCOVER")).not.toBeInTheDocument();
    expect(screen.queryByText("CONFIG")).not.toBeInTheDocument();
  });

  it("hides RESCAN when canRescan is false", () => {
    render(SourceWindow, {
      props: {
        source: makeSource({
          capabilities: { canRescan: false, canReceiveConfig: true },
        }),
      },
    });

    expect(screen.queryByText("RESCAN")).not.toBeInTheDocument();
  });

  it("renders no action buttons when canRescan is false", () => {
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

  it("hides SETTINGS when canReceiveConfig is false", async () => {
    render(SourceWindow, {
      props: {
        source: makeSource({
          name: "PLUGIN · GAMING-RIG",
          sourceKind: "plugin",
          capabilities: { canRescan: false, canReceiveConfig: false },
        }),
        initialGameId: "d2r",
      },
    });

    // Give async effects time to settle
    await vi.waitFor(() => {
      expect(screen.getByText("Diablo II: Resurrected")).toBeInTheDocument();
    });

    expect(screen.queryByText("SETTINGS")).not.toBeInTheDocument();
  });
});

describe("SourceWindow inline game settings", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows SETTINGS toggle at game level", async () => {
    render(SourceWindow, {
      props: { source: makeSource(), initialGameId: "d2r" },
    });

    // Wait for async config load
    await vi.waitFor(() => {
      expect(screen.getByText("SETTINGS")).toBeInTheDocument();
    });
  });

  it("expands settings and shows config fields", async () => {
    render(SourceWindow, {
      props: { source: makeSource(), initialGameId: "d2r" },
    });

    await vi.waitFor(() => {
      expect(screen.getByText("SETTINGS")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("SETTINGS"));

    await vi.waitFor(() => {
      expect(screen.getByText("SAVE PATH")).toBeInTheDocument();
      expect(screen.getByText("FILE EXTENSIONS")).toBeInTheDocument();
      expect(screen.getByText("Enabled")).toBeInTheDocument();
      expect(screen.getByText("TEST")).toBeInTheDocument();
      expect(screen.getByText("SAVE")).toBeInTheDocument();
    });
  });

  it("pre-fills save path from fetched config", async () => {
    render(SourceWindow, {
      props: { source: makeSource(), initialGameId: "d2r" },
    });

    await vi.waitFor(() => {
      expect(screen.getByText("SETTINGS")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("SETTINGS"));

    await vi.waitFor(() => {
      const input = screen.getByPlaceholderText<HTMLInputElement>("Save directory path...");
      expect(input.value).toBe("/saves/d2r");
    });
  });

  it("shows file extension chips", async () => {
    render(SourceWindow, {
      props: { source: makeSource(), initialGameId: "d2r" },
    });

    await vi.waitFor(() => {
      expect(screen.getByText("SETTINGS")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("SETTINGS"));

    await vi.waitFor(() => {
      expect(screen.getByText(".d2s")).toBeInTheDocument();
      expect(screen.getByText(".d2i")).toBeInTheDocument();
    });
  });

  it("calls saveSourceConfig on SAVE click", async () => {
    render(SourceWindow, {
      props: { source: makeSource(), initialGameId: "d2r" },
    });

    await vi.waitFor(() => {
      expect(screen.getByText("SETTINGS")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("SETTINGS"));

    await vi.waitFor(() => {
      expect(screen.getByText("SAVE")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("SAVE"));

    await vi.waitFor(() => {
      expect(saveSourceConfig).toHaveBeenCalledWith(
        "test-source",
        expect.objectContaining({
          d2r: expect.objectContaining({ savePath: "/saves/d2r", enabled: true }),
        }),
      );
    });
  });

  it("sends testPath message on TEST click", async () => {
    render(SourceWindow, {
      props: { source: makeSource(), initialGameId: "d2r" },
    });

    await vi.waitFor(() => {
      expect(screen.getByText("SETTINGS")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("SETTINGS"));

    await vi.waitFor(() => {
      expect(screen.getByText("TEST")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("TEST"));

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ testPath: { gameId: "d2r", path: "/saves/d2r" } }),
    );
  });
});
