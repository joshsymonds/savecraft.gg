import type { Message } from "$lib/proto/savecraft/v1/protocol";
import { get, writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the sources store so sourceHostname() can resolve hostnames.
const mockSources = writable<{ id: string; hostname: string | null }[]>([]);
vi.mock("./sources", () => ({ sources: mockSources }));

// Mock plugins store (gameDisplayName).
vi.mock("./plugins", () => ({
  gameDisplayName: (id: string) => id.toUpperCase(),
}));

const { activityEvents, dispatchToActivity, pushActivityEvent, resetActivity } = await import("./activity");

/** Helper to build a Message with the given payload. */
function msg(payload: Message["payload"]): Message {
  return { payload };
}

function lastEvent() {
  return get(activityEvents)[0];
}

describe("dispatchToActivity", () => {
  beforeEach(() => {
    resetActivity();
    mockSources.set([]);
  });

  afterEach(() => {
    resetActivity();
    mockSources.set([]);
  });

  // --- sourceOnline ---

  describe("sourceOnline", () => {
    it("uses hostname from the message", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "sourceOnline",
        sourceOnline: {
          version: "0.2.0", timestamp: undefined,
          platform: "linux-amd64", os: "linux", arch: "amd64",
          hostname: "josh-pc",
        },
      }));

      const event = lastEvent()!;
      expect(event.type).toBe("daemon_online");
      expect(event.message).toBe("JOSH-PC connected");
      expect(event.detail).toBe("linux · 0.2.0");
    });

    it("falls back to sources store hostname when message has none", () => {
      mockSources.set([{
        id: "src-1",
        hostname: "gaming-rig",
      }]);

      dispatchToActivity("src-1", undefined, msg({
        $case: "sourceOnline",
        sourceOnline: {
          version: "dev", timestamp: undefined,
          platform: "", os: "", arch: "",
          hostname: "",
        },
      }));

      expect(lastEvent()!.message).toBe("GAMING-RIG connected");
    });

    it("falls back to 'Daemon' when no hostname is available", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "sourceOnline",
        sourceOnline: {
          version: "", timestamp: undefined,
          platform: "", os: "", arch: "",
          hostname: "",
        },
      }));

      expect(lastEvent()!.message).toBe("Daemon connected");
      expect(lastEvent()!.detail).toBeUndefined();
    });

    it("shows only os when version is empty", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "sourceOnline",
        sourceOnline: {
          version: "", timestamp: undefined,
          platform: "", os: "darwin", arch: "",
          hostname: "macbook",
        },
      }));

      expect(lastEvent()!.detail).toBe("darwin");
    });

    it("shows only version when os is empty", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "sourceOnline",
        sourceOnline: {
          version: "1.0.0", timestamp: undefined,
          platform: "", os: "", arch: "",
          hostname: "box",
        },
      }));

      expect(lastEvent()!.detail).toBe("1.0.0");
    });
  });

  // --- sourceOffline ---

  describe("sourceOffline", () => {
    it("looks up hostname from sources store", () => {
      mockSources.set([{ id: "src-1", hostname: "josh-pc" }]);

      dispatchToActivity("src-1", undefined, msg({
        $case: "sourceOffline",
        sourceOffline: { timestamp: undefined },
      }));

      const event = lastEvent()!;
      expect(event.type).toBe("daemon_offline");
      expect(event.message).toBe("JOSH-PC disconnected");
    });

    it("falls back to 'Daemon' when source not in store", () => {
      dispatchToActivity("unknown-src", undefined, msg({
        $case: "sourceOffline",
        sourceOffline: { timestamp: undefined },
      }));

      expect(lastEvent()!.message).toBe("Daemon disconnected");
    });
  });

  // --- game events ---

  describe("game events", () => {
    it("gameDetected with save count", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "gameDetected",
        gameDetected: { gameId: "d2r", path: "/saves", saveCount: 3 },
      }));

      const event = lastEvent()!;
      expect(event.type).toBe("game_detected");
      expect(event.message).toBe("Found D2R");
      expect(event.detail).toBe("3 save files");
    });

    it("gameDetected with zero saves omits detail", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "gameDetected",
        gameDetected: { gameId: "d2r", path: "", saveCount: 0 },
      }));

      expect(lastEvent()!.detail).toBeUndefined();
    });

    it("gameNotFound", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "gameNotFound",
        gameNotFound: { gameId: "d2r", pathsChecked: [] },
      }));

      expect(lastEvent()!.message).toBe("D2R not found");
    });

    it("watching", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "watching",
        watching: { gameId: "d2r", path: "/home/saves", filesMonitored: 3 },
      }));

      expect(lastEvent()!.message).toBe("Watching D2R saves");
      expect(lastEvent()!.detail).toBe("/home/saves");
    });

    it("gamesDiscovered singular", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "gamesDiscovered",
        gamesDiscovered: { games: [{ gameId: "d2r", name: "D2R", path: "/saves", fileCount: 1, fileExtensions: [".d2s"] }] },
      }));

      expect(lastEvent()!.message).toBe("Discovered 1 game");
    });

    it("gamesDiscovered plural", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "gamesDiscovered",
        gamesDiscovered: {
          games: [
            { gameId: "d2r", name: "D2R", path: "/a", fileCount: 1, fileExtensions: [".d2s"] },
            { gameId: "wow", name: "WoW", path: "/b", fileCount: 2, fileExtensions: [".wtf"] },
          ],
        },
      }));

      expect(lastEvent()!.message).toBe("Discovered 2 games");
    });
  });

  // --- parse/push events ---

  describe("parse and push events", () => {
    it("parseCompleted with summary", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "parseCompleted",
        parseCompleted: {
          gameId: "d2r", fileName: "Atmus.d2s", summary: "Hammerdin, Lv89",
          sectionsCount: 5, sizeBytes: 2048, identity: undefined,
        },
      }));

      const event = lastEvent()!;
      expect(event.message).toBe("Hammerdin, Lv89");
      expect(event.detail).toBe("5 sections · 2KB");
    });

    it("parseCompleted falls back to filename", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "parseCompleted",
        parseCompleted: {
          gameId: "d2r", fileName: "Atmus.d2s", summary: "",
          sectionsCount: 0, sizeBytes: 0, identity: undefined,
        },
      }));

      expect(lastEvent()!.message).toBe("Parsed Atmus.d2s");
    });

    it("parseFailed", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "parseFailed",
        parseFailed: {
          gameId: "d2r", fileName: "bad.d2s", errorType: 0, message: "invalid header",
        },
      }));

      expect(lastEvent()!.message).toBe("bad.d2s — invalid header");
    });

    it("pushCompleted with summary and timing", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "pushCompleted",
        pushCompleted: {
          gameId: "d2r", saveUuid: "uuid-1", summary: "Upload complete",
          snapshotSizeBytes: 1_048_576, durationMs: 150, identity: undefined,
        },
      }));

      const event = lastEvent()!;
      expect(event.message).toBe("Upload complete");
      expect(event.detail).toBe("1.0MB · 150ms");
    });

    it("pushFailed with retry", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "pushFailed",
        pushFailed: { gameId: "d2r", message: "timeout", willRetry: true },
      }));

      const event = lastEvent()!;
      expect(event.message).toBe("timeout");
      expect(event.detail).toBe("will retry");
    });
  });

  // --- plugin events ---

  describe("plugin events", () => {
    it("pluginUpdated", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "pluginUpdated",
        pluginUpdated: { gameId: "d2r", version: "2.1.0" },
      }));

      const event = lastEvent()!;
      expect(event.message).toBe("D2R updated");
      expect(event.detail).toBe("v2.1.0");
    });

    it("pluginDownloadFailed", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "pluginDownloadFailed",
        pluginDownloadFailed: { gameId: "d2r", message: "404 not found" },
      }));

      expect(lastEvent()!.message).toBe("D2R download failed");
      expect(lastEvent()!.detail).toBe("404 not found");
    });
  });

  // --- filtering and lifecycle ---

  describe("filtering and lifecycle", () => {
    it("ignores sourceState messages", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "sourceState",
        sourceState: { sources: [] },
      }));

      expect(get(activityEvents)).toHaveLength(0);
    });

    it("ignores undefined messages", () => {
      dispatchToActivity("src-1");
      expect(get(activityEvents)).toHaveLength(0);
    });

    it("ignores messages with no payload", () => {
      dispatchToActivity("src-1", undefined, { payload: undefined });
      expect(get(activityEvents)).toHaveLength(0);
    });

    it("caps events at MAX_EVENTS (100)", () => {
      for (let index = 0; index < 110; index++) {
        dispatchToActivity("src-1", undefined, msg({
          $case: "sourceOnline",
          sourceOnline: {
            version: `v${String(index)}`, timestamp: undefined,
            platform: "", os: "", arch: "", hostname: "box",
          },
        }));
      }

      expect(get(activityEvents)).toHaveLength(100);
      // Most recent event should be first
      expect(get(activityEvents)[0]!.message).toBe("BOX connected");
    });

    it("resetActivity clears all events", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "sourceOnline",
        sourceOnline: {
          version: "dev", timestamp: undefined,
          platform: "", os: "", arch: "", hostname: "",
        },
      }));

      expect(get(activityEvents)).toHaveLength(1);
      resetActivity();
      expect(get(activityEvents)).toHaveLength(0);
    });

    it("newest event is prepended", () => {
      dispatchToActivity("src-1", undefined, msg({
        $case: "sourceOnline",
        sourceOnline: {
          version: "", timestamp: undefined,
          platform: "", os: "", arch: "", hostname: "first",
        },
      }));
      dispatchToActivity("src-1", undefined, msg({
        $case: "sourceOffline",
        sourceOffline: { timestamp: undefined },
      }));

      const events = get(activityEvents);
      expect(events).toHaveLength(2);
      expect(events[0]!.type).toBe("daemon_offline");
      expect(events[1]!.type).toBe("daemon_online");
    });
  });
});

describe("pushActivityEvent", () => {
  beforeEach(() => {
    resetActivity();
  });

  it("adds an event with correct type, message, and detail", () => {
    pushActivityEvent("oauth_failed", "Connection failed", "token_failed");

    const event = get(activityEvents)[0]!;
    expect(event.type).toBe("oauth_failed");
    expect(event.message).toBe("Connection failed");
    expect(event.detail).toBe("token_failed");
    expect(event.id).toBeTruthy();
    expect(event.time).toBeTruthy();
  });

  it("adds an event without detail", () => {
    pushActivityEvent("oauth_connected", "Connected");

    const event = get(activityEvents)[0]!;
    expect(event.type).toBe("oauth_connected");
    expect(event.message).toBe("Connected");
    expect(event.detail).toBeUndefined();
  });

  it("prepends to existing events", () => {
    dispatchToActivity("src-1", undefined, msg({
      $case: "sourceOnline",
      sourceOnline: {
        version: "", timestamp: undefined,
        platform: "", os: "", arch: "", hostname: "box",
      },
    }));
    pushActivityEvent("oauth_connected", "WoW connected");

    const events = get(activityEvents);
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe("oauth_connected");
    expect(events[1]!.type).toBe("daemon_online");
  });
});
