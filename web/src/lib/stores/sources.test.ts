import { GameStatusEnum, type Message } from "$lib/proto/savecraft/v1/protocol";
import { get } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./plugins", () => ({
  gameDisplayName: (id: string) => id.toUpperCase(),
}));

vi.mock("$lib/utils/time", () => ({
  relativeTime: (ts: string) => ts,
}));

const { sources, dispatchToSources, resetSources } = await import("./sources");

function msg(payload: Message["payload"]): Message {
  return { payload };
}

function sourceStateMsg(
  sources: {
    sourceId: string;
    online?: boolean;
    sourceKind?: string;
    hostname?: string;
    games?: {
      gameId: string;
      gameName?: string;
      status?: GameStatusEnum;
      saves?: { saveUuid: string; identity?: { name: string }; summary: string }[];
      path?: string;
    }[];
  }[],
): Message {
  return msg({
    $case: "sourceState",
    sourceState: {
      sources: sources.map((s) => ({
        sourceId: s.sourceId,
        online: s.online ?? true,
        sourceKind: s.sourceKind ?? "daemon",
        hostname: s.hostname ?? "",
        os: "",
        arch: "",
        device: "",
        platform: "",
        canRescan: true,
        canReceiveConfig: true,
        lastSeen: undefined,
        games: (s.games ?? []).map((g) => ({
          gameId: g.gameId,
          gameName: g.gameName ?? g.gameId.toUpperCase(),
          status: g.status ?? GameStatusEnum.GAME_STATUS_ENUM_WATCHING,
          saves: (g.saves ?? []).map((sv) => ({
            saveUuid: sv.saveUuid,
            identity: sv.identity ? { ...sv.identity, extra: undefined } : undefined,
            summary: sv.summary,
            lastUpdated: undefined,
          })),
          lastActivity: undefined,
          path: g.path ?? "",
          error: "",
        })),
      })),
    },
  });
}

describe("sources store", () => {
  afterEach(() => {
    resetSources();
  });

  describe("sourceState", () => {
    it("sets sources from a sourceState snapshot", () => {
      dispatchToSources(
        "src-1",
        sourceStateMsg([
          {
            sourceId: "src-1",
            hostname: "steamdeck",
            games: [
              {
                gameId: "d2r",
                gameName: "Diablo II: Resurrected",
                saves: [{ saveUuid: "s1", identity: { name: "Hammerdin" }, summary: "Level 89" }],
              },
            ],
          },
        ]),
      );

      const srcs = get(sources);
      expect(srcs).toHaveLength(1);
      expect(srcs[0]!.id).toBe("src-1");
      expect(srcs[0]!.games).toHaveLength(1);
      expect(srcs[0]!.games[0]!.gameId).toBe("d2r");
      expect(srcs[0]!.games[0]!.saves).toHaveLength(1);
      expect(srcs[0]!.games[0]!.saves[0]!.saveName).toBe("Hammerdin");
    });

    it("replaces entire state on each sourceState message", () => {
      dispatchToSources("", sourceStateMsg([{ sourceId: "src-1", games: [{ gameId: "d2r" }] }]));
      expect(get(sources)).toHaveLength(1);

      dispatchToSources("", sourceStateMsg([{ sourceId: "src-2", games: [{ gameId: "sdv" }] }]));

      const srcs = get(sources);
      expect(srcs).toHaveLength(1);
      expect(srcs[0]!.id).toBe("src-2");
      expect(srcs[0]!.games[0]!.gameId).toBe("sdv");
    });
  });

  describe("replay immunity", () => {
    it("gameDetected event does not add a game to the store", () => {
      dispatchToSources("", sourceStateMsg([{ sourceId: "src-1", games: [{ gameId: "d2r" }] }]));

      dispatchToSources(
        "src-1",
        msg({
          $case: "gameDetected",
          gameDetected: { gameId: "clair-obscur", path: "/saves/co", saveCount: 0 },
        }),
      );

      const srcs = get(sources);
      expect(srcs[0]!.games).toHaveLength(1);
      expect(srcs[0]!.games[0]!.gameId).toBe("d2r");
    });

    it("pushCompleted event does not add a game or save to the store", () => {
      dispatchToSources("", sourceStateMsg([{ sourceId: "src-1", games: [] }]));

      dispatchToSources(
        "src-1",
        msg({
          $case: "pushCompleted",
          pushCompleted: {
            gameId: "d2r",
            saveUuid: "s1",
            summary: "Level 89",
            identity: { name: "Hammerdin", extra: undefined },
            durationMs: 0,
            snapshotSizeBytes: 0,
          },
        }),
      );

      const srcs = get(sources);
      expect(srcs[0]!.games).toHaveLength(0);
    });

    it("sourceOnline event does not add a source to the store", () => {
      dispatchToSources("", sourceStateMsg([]));

      dispatchToSources(
        "new-source",
        msg({
          $case: "sourceOnline",
          sourceOnline: {
            version: "0.1.0",
            timestamp: undefined,
            platform: "",
            os: "",
            arch: "",
            hostname: "new-host",
            device: "",
          },
        }),
      );

      expect(get(sources)).toHaveLength(0);
    });

    it("parseFailed event does not add a game to the store", () => {
      dispatchToSources("", sourceStateMsg([{ sourceId: "src-1", games: [] }]));

      dispatchToSources(
        "src-1",
        msg({
          $case: "parseFailed",
          parseFailed: {
            gameId: "d2r",
            fileName: "test.d2s",
            errorType: 0,
            message: "corrupt",
          },
        }),
      );

      expect(get(sources)[0]!.games).toHaveLength(0);
    });
  });
});
