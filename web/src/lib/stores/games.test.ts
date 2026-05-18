import type { PluginManifest } from "$lib/api/client";
import type { Game, Save, Source } from "$lib/types/source";
import { describe, expect, it } from "vitest";

import { buildPickerCatalog, connectionMethods, mergeGames } from "./games";

function makeSource(overrides: Partial<Source> & { id: string }): Source {
  return {
    name: overrides.id,
    sourceKind: "daemon",
    hostname: overrides.id,
    platform: "linux",
    device: null,
    status: "online",
    version: "0.1.0",
    lastSeen: "now",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [],
    ...overrides,
  };
}

describe("mergeGames", () => {
  it("returns empty array for empty sources", () => {
    expect(mergeGames([])).toEqual([]);
  });

  it("merges a single source with one game", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
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
      }),
    ];

    const result = mergeGames(sources);
    expect(result).toHaveLength(1);
    const game = result[0]!;
    expect(game.gameId).toBe("d2r");
    expect(game.sourceCount).toBe(1);
    expect(game.saves).toHaveLength(1);
    expect(game.saves[0]!.sourceId).toBe("src-1");
    expect(game.saves[0]!.sourceName).toBe("src-1");
    expect(game.sources).toHaveLength(1);
    expect(game.sources[0]!.sourceId).toBe("src-1");
    expect(game.sources[0]!.status).toBe("watching");
    expect(game.needsConfig).toBe(false);
  });

  it("merges same game across two sources", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
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
      }),
      makeSource({
        id: "src-2",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "1 save",
            saves: [
              {
                saveUuid: "s2",
                saveName: "Blizzara",
                summary: "Sorc",
                lastUpdated: "1h ago",
                status: "success",
              },
            ],
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result).toHaveLength(1);
    const game = result[0]!;
    expect(game.gameId).toBe("d2r");
    expect(game.sourceCount).toBe(2);
    expect(game.saves).toHaveLength(2);
    expect(game.saves.map((s: Save) => s.sourceId)).toEqual(["src-1", "src-2"]);
  });

  it("keeps different games separate", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "",
            saves: [],
          },
          { gameId: "sdv", name: "Stardew Valley", status: "watching", statusLine: "", saves: [] },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result).toHaveLength(2);
    const gameIds = result.map((g: Game) => g.gameId);
    expect(gameIds).toContain("d2r");
    expect(gameIds).toContain("sdv");
  });

  it("sorts games alphabetically by name", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        games: [
          { gameId: "sdv", name: "Stardew Valley", status: "watching", statusLine: "", saves: [] },
          { gameId: "bg3", name: "Baldur's Gate 3", status: "watching", statusLine: "", saves: [] },
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "",
            saves: [],
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result.map((g: Game) => g.name)).toEqual([
      "Baldur's Gate 3",
      "Diablo II: Resurrected",
      "Stardew Valley",
    ]);
  });

  it("sets Save sourceId and sourceName correctly", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        name: "GAMING-PC",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "",
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
      }),
    ];

    const result = mergeGames(sources);
    expect(result[0]!.saves[0]!.sourceId).toBe("src-1");
    expect(result[0]!.saves[0]!.sourceName).toBe("GAMING-PC");
  });

  it("generates statusLine from save count", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "",
            saves: [
              { saveUuid: "s1", saveName: "A", summary: "", lastUpdated: "now", status: "success" },
              { saveUuid: "s2", saveName: "B", summary: "", lastUpdated: "now", status: "success" },
            ],
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result[0]!.statusLine).toBe("2 saves");
  });

  it("handles singular save count", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "",
            saves: [
              { saveUuid: "s1", saveName: "A", summary: "", lastUpdated: "now", status: "success" },
            ],
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result[0]!.statusLine).toBe("1 save");
  });

  it("sets needsConfig when a source has not_found status", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "not_found",
            statusLine: "",
            saves: [],
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result[0]!.needsConfig).toBe(true);
    expect(result[0]!.sources[0]!.status).toBe("not_found");
  });

  it("sets needsConfig when a source has error status", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "error",
            statusLine: "",
            saves: [],
            error: "plugin crashed",
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result[0]!.needsConfig).toBe(true);
    expect(result[0]!.sources[0]!.error).toBe("plugin crashed");
  });

  it("populates source entries with path and hostname", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        name: "DAEMON · JOSH-PC",
        hostname: "josh-pc",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "",
            path: "/home/josh/.d2r/saves",
            saves: [
              { saveUuid: "s1", saveName: "A", summary: "", lastUpdated: "now", status: "success" },
            ],
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    const se = result[0]!.sources[0]!;
    expect(se.sourceName).toBe("DAEMON · JOSH-PC");
    expect(se.hostname).toBe("josh-pc");
    expect(se.path).toBe("/home/josh/.d2r/saves");
    expect(se.saveCount).toBe(1);
  });

  it("shows 'No saves' when empty", () => {
    const sources: Source[] = [
      makeSource({
        id: "src-1",
        games: [
          {
            gameId: "d2r",
            name: "Diablo II: Resurrected",
            status: "watching",
            statusLine: "",
            saves: [],
          },
        ],
      }),
    ];

    const result = mergeGames(sources);
    expect(result[0]!.statusLine).toBe("No saves");
  });
});

function makeManifest(overrides: Partial<PluginManifest> & { game_id: string }): PluginManifest {
  return {
    name: overrides.game_id,
    description: "Test game",
    version: "1.0.0",
    file_extensions: [".sav"],
    default_paths: {},
    coverage: "full",
    ...overrides,
  };
}

describe("buildPickerCatalog", () => {
  it("does not crash when manifest has null file_extensions", () => {
    const plugins = new Map<string, PluginManifest>([
      [
        "wow",
        makeManifest({
          game_id: "wow",
          name: "World of Warcraft",
          source: "api",
          file_extensions: null,
          adapter: { authProvider: "battlenet", regions: ["us", "eu"] },
        }),
      ],
    ]);
    const result = buildPickerCatalog(plugins, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.gameId).toBe("wow");
  });

  it("uses manifest.description for mod-source manifests with no file_extensions", () => {
    const plugins = new Map<string, PluginManifest>([
      [
        "stellaris",
        makeManifest({
          game_id: "stellaris",
          name: "Stellaris",
          description: "Grand strategy saves",
          source: "mod",
          file_extensions: null,
        }),
      ],
    ]);
    const result = buildPickerCatalog(plugins, []);
    expect(result[0]!.description).toBe("Grand strategy saves");
  });

  it("formats file_extensions into description when present", () => {
    const plugins = new Map<string, PluginManifest>([
      [
        "d2r",
        makeManifest({
          game_id: "d2r",
          name: "Diablo II: Resurrected",
          file_extensions: [".d2s", ".d2i"],
        }),
      ],
    ]);
    const result = buildPickerCatalog(plugins, []);
    expect(result[0]!.description).toBe("Parses .d2s, .d2i files");
  });

  it("marks watched games correctly", () => {
    const plugins = new Map<string, PluginManifest>([
      ["d2r", makeManifest({ game_id: "d2r", name: "Diablo II: Resurrected" })],
    ]);
    const mergedGames: Game[] = [
      {
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        iconUrl: undefined,
        statusLine: "1 save",
        saves: [
          {
            saveUuid: "s1",
            saveName: "Atmus",
            summary: "Paladin",
            lastUpdated: "now",
            status: "success",
            sourceId: "src-1",
            sourceName: "PC",
          },
        ],
        sourceCount: 1,
        sources: [],
        needsConfig: false,
      },
    ];
    const result = buildPickerCatalog(plugins, mergedGames);
    expect(result[0]!.watched).toBe(true);
    expect(result[0]!.saveCount).toBe(1);
  });

  it("sorts results alphabetically", () => {
    const plugins = new Map<string, PluginManifest>([
      ["sdv", makeManifest({ game_id: "sdv", name: "Stardew Valley" })],
      ["bg3", makeManifest({ game_id: "bg3", name: "Baldur's Gate 3" })],
      ["d2r", makeManifest({ game_id: "d2r", name: "Diablo II: Resurrected" })],
    ]);
    const result = buildPickerCatalog(plugins, []);
    expect(result.map((g) => g.name)).toEqual([
      "Baldur's Gate 3",
      "Diablo II: Resurrected",
      "Stardew Valley",
    ]);
  });

  it("includes manifests with an api source", () => {
    const plugins = new Map<string, PluginManifest>([
      [
        "wow",
        makeManifest({
          game_id: "wow",
          name: "World of Warcraft",
          source: "api",
          file_extensions: [],
          adapter: { authProvider: "battlenet", regions: ["us"] },
        }),
      ],
    ]);
    const result = buildPickerCatalog(plugins, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.gameId).toBe("wow");
  });

  it("includes manifests with a workshop_url", () => {
    const plugins = new Map<string, PluginManifest>([
      [
        "rimworld",
        makeManifest({
          game_id: "rimworld",
          name: "RimWorld",
          source: "mod",
          file_extensions: [],
          workshop_url: "steam://workshop/123",
        }),
      ],
    ]);
    const result = buildPickerCatalog(plugins, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.gameId).toBe("rimworld");
  });

  it("includes manifests with file_extensions", () => {
    const plugins = new Map<string, PluginManifest>([
      ["d2r", makeManifest({ game_id: "d2r", name: "Diablo II: Resurrected" })],
    ]);
    const result = buildPickerCatalog(plugins, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.gameId).toBe("d2r");
  });

  // Unified model (#17): every supported game is in the catalog. The
  // wire contract is `sources: string[]` + `adapter`; the singular
  // `source` is dead and never sent by the server. Classification drives
  // off connectionMethods, never `manifest.source`.

  it("includes adapter games (wow/poe) as OAuth, isApiGame + adapter set", () => {
    const plugins = new Map<string, PluginManifest>([
      [
        "poe",
        makeManifest({
          game_id: "poe",
          name: "Path of Exile",
          sources: ["api"],
          file_extensions: [],
          adapter: { authProvider: "ggg", regions: ["pc"] },
        }),
      ],
    ]);
    const [poe] = buildPickerCatalog(plugins, []);
    expect(poe!.gameId).toBe("poe");
    expect(poe!.isApiGame).toBe(true);
    expect(poe!.adapter).toEqual({ authProvider: "ggg", regions: ["pc"] });
    expect(poe!.methods).toEqual(["adapter"]);
  });

  it("includes reference-only games as ready (no setup), not excluded", () => {
    const plugins = new Map<string, PluginManifest>([
      [
        "refonly",
        makeManifest({
          game_id: "refonly",
          name: "Reference Only",
          sources: [],
          file_extensions: [],
        }),
      ],
    ]);
    const result = buildPickerCatalog(plugins, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.methods).toEqual(["reference"]);
    expect(result[0]!.isApiGame).toBeFalsy();
    expect(result[0]!.watched).toBe(false);
  });

  it("classifies a wasm save-file game as daemon", () => {
    const plugins = new Map<string, PluginManifest>([
      [
        "d2r",
        makeManifest({
          game_id: "d2r",
          name: "Diablo II: Resurrected",
          sources: ["wasm"],
          file_extensions: [".d2s"],
        }),
      ],
    ]);
    const [d2r] = buildPickerCatalog(plugins, []);
    expect(d2r!.methods).toEqual(["daemon"]);
    expect(d2r!.isApiGame).toBeFalsy();
  });

  it("classifies a mod/workshop game as mod (no daemon)", () => {
    const plugins = new Map<string, PluginManifest>([
      [
        "rimworld",
        makeManifest({
          game_id: "rimworld",
          name: "RimWorld",
          sources: ["mod"],
          file_extensions: [],
          workshop_url: "steam://workshop/123",
        }),
      ],
    ]);
    const [rim] = buildPickerCatalog(plugins, []);
    expect(rim!.methods).toEqual(["mod"]);
  });

  it("classifies a hybrid wasm+mod game as both daemon and mod", () => {
    const plugins = new Map<string, PluginManifest>([
      [
        "factorio",
        makeManifest({
          game_id: "factorio",
          name: "Factorio",
          sources: ["wasm", "mod"],
          file_extensions: [".zip"],
        }),
      ],
    ]);
    const [fac] = buildPickerCatalog(plugins, []);
    expect(fac!.methods).toEqual(["daemon", "mod"]);
  });

  it("includes every supported game (catalog), regardless of method", () => {
    const plugins = new Map<string, PluginManifest>([
      ["d2r", makeManifest({ game_id: "d2r", name: "Diablo II", sources: ["wasm"] })],
      [
        "poe",
        makeManifest({
          game_id: "poe",
          name: "Path of Exile",
          sources: ["api"],
          file_extensions: [],
          adapter: { authProvider: "ggg", regions: ["pc"] },
        }),
      ],
      [
        "refonly",
        makeManifest({ game_id: "refonly", name: "Ref Only", sources: [], file_extensions: [] }),
      ],
    ]);
    const result = buildPickerCatalog(plugins, []);
    expect(result.map((g) => g.gameId).sort((a, b) => a.localeCompare(b))).toEqual([
      "d2r",
      "poe",
      "refonly",
    ]);
  });
});

describe("connectionMethods", () => {
  it("adapter block → ['adapter']", () => {
    expect(
      connectionMethods(
        makeManifest({
          game_id: "wow",
          sources: ["api"],
          adapter: { authProvider: "battlenet", regions: ["us"] },
        }),
      ),
    ).toEqual(["adapter"]);
  });

  it("sources includes wasm → ['daemon']", () => {
    expect(connectionMethods(makeManifest({ game_id: "d2r", sources: ["wasm"] }))).toEqual([
      "daemon",
    ]);
  });

  it("sources includes mod OR workshop_url → ['mod']", () => {
    expect(connectionMethods(makeManifest({ game_id: "rw", sources: ["mod"] }))).toEqual(["mod"]);
    expect(
      connectionMethods(
        makeManifest({ game_id: "rw2", sources: [], workshop_url: "steam://workshop/1" }),
      ),
    ).toEqual(["mod"]);
  });

  it("wasm + mod → ['daemon','mod'] (hybrid)", () => {
    expect(connectionMethods(makeManifest({ game_id: "fac", sources: ["wasm", "mod"] }))).toEqual([
      "daemon",
      "mod",
    ]);
  });

  it("no adapter, no sources, no workshop → ['reference']", () => {
    expect(connectionMethods(makeManifest({ game_id: "x", sources: [] }))).toEqual(["reference"]);
    expect(connectionMethods(makeManifest({ game_id: "y" }))).toEqual(["reference"]);
  });

  it("never keys off the dead singular `source` field", () => {
    // source:"api" with no adapter block and no sources must NOT be treated
    // as an adapter — the server never sends a singular `source`.
    expect(connectionMethods(makeManifest({ game_id: "z", source: "api", sources: [] }))).toEqual([
      "reference",
    ]);
  });
});
