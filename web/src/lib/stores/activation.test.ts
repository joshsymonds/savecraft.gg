import type { GameConfigInput, PluginManifest } from "$lib/api/client";
import { writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted writable stores we can control from tests
const pluginsStore = writable(new Map<string, PluginManifest>());
const discoveredStore = writable(
  new Map<string, { gameId: string; name: string; path: string; fileCount: number }>(),
);

vi.mock("$lib/api/client", () => ({
  fetchSourceConfig: vi.fn(),
  saveSourceConfig: vi.fn(),
}));

vi.mock("$lib/stores/plugins", () => ({
  plugins: { subscribe: pluginsStore.subscribe },
}));

vi.mock("$lib/stores/discovery", () => ({
  discoveredGames: { subscribe: discoveredStore.subscribe },
}));

const { fetchSourceConfig, saveSourceConfig } = await import("$lib/api/client");
const { activateGame } = await import("./activation");

function makePlugin(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    game_id: "d2r",
    name: "Diablo II: Resurrected",
    version: "0.1.0",
    file_extensions: [".d2s", ".d2i"],
    default_paths: {
      linux: "/home/user/Saved Games/Diablo II Resurrected/",
      windows: "C:\\Users\\user\\Saved Games\\Diablo II Resurrected\\",
    },
    coverage: "partial",
    ...overrides,
  };
}

describe("activateGame", () => {
  beforeEach(() => {
    vi.mocked(fetchSourceConfig).mockResolvedValue({});
    vi.mocked(saveSourceConfig).mockResolvedValue();
    pluginsStore.set(new Map([["d2r", makePlugin()]]));
    discoveredStore.set(new Map());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches existing config and PUTs with game enabled", async () => {
    await activateGame("source-1", "d2r");

    expect(fetchSourceConfig).toHaveBeenCalledWith("source-1");
    expect(saveSourceConfig).toHaveBeenCalledWith("source-1", {
      d2r: {
        savePath: "/home/user/Saved Games/Diablo II Resurrected/",
        enabled: true,
        fileExtensions: [".d2s", ".d2i"],
      },
    });
  });

  it("preserves existing enabled games in the PUT", async () => {
    const existingConfig: Record<string, GameConfigInput> = {
      stardew: {
        savePath: "/saves/stardew",
        enabled: true,
        fileExtensions: [".xml"],
      },
    };
    vi.mocked(fetchSourceConfig).mockResolvedValue(existingConfig);

    await activateGame("source-1", "d2r");

    const putCall = vi.mocked(saveSourceConfig).mock.calls[0]!;
    expect(putCall[1]).toHaveProperty("stardew", existingConfig.stardew);
    expect(putCall[1]).toHaveProperty("d2r");
    expect(putCall[1].d2r!.enabled).toBe(true);
  });

  it("uses discovered path over plugin default", async () => {
    discoveredStore.set(
      new Map([["d2r", { gameId: "d2r", name: "D2R", path: "/discovered/path", fileCount: 3 }]]),
    );

    await activateGame("source-1", "d2r");

    const putCall = vi.mocked(saveSourceConfig).mock.calls[0]!;
    expect(putCall[1].d2r!.savePath).toBe("/discovered/path");
  });

  it("falls back to plugin default path when no discovery", async () => {
    await activateGame("source-1", "d2r");

    const putCall = vi.mocked(saveSourceConfig).mock.calls[0]!;
    // Test env has no real navigator, so detectOS() falls through to "linux"
    expect(putCall[1].d2r!.savePath).toBe("/home/user/Saved Games/Diablo II Resurrected/");
  });

  it("propagates fetch errors to caller", async () => {
    vi.mocked(fetchSourceConfig).mockRejectedValue(new Error("network error"));

    await expect(activateGame("source-1", "d2r")).rejects.toThrow("network error");
    expect(saveSourceConfig).not.toHaveBeenCalled();
  });

  it("propagates save errors to caller", async () => {
    vi.mocked(saveSourceConfig).mockRejectedValue(new Error("save failed"));

    await expect(activateGame("source-1", "d2r")).rejects.toThrow("save failed");
  });
});
