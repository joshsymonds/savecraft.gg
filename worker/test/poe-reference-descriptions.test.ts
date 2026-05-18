import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { poeAdapter } from "../../plugins/poe/adapter";
import { ensureGggAccessToken } from "../../plugins/poe/adapter/ggg-api";
import { buildPlannerModule } from "../../plugins/poe/reference/build-planner";
import { economyModule } from "../../plugins/poe/reference/economy";
import { gemSearchModule } from "../../plugins/poe/reference/gem-search";
import { modSearchModule } from "../../plugins/poe/reference/mod-search";
import { passiveTreeModule } from "../../plugins/poe/reference/passive-tree";
import { uniqueSearchModule } from "../../plugins/poe/reference/unique-search";
import {
  AdapterError,
  connectAdapterGuidance,
  reconnectAdapterAction,
  SAVECRAFT_APP_URL,
} from "../src/adapters/adapter";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

const DEAD = "savecraft.gg/settings";

function poeEnv(): Env {
  return { ...env, POB_URL: "https://pob.savecraft.gg" } as unknown as Env;
}

describe("connect-guidance copy (epic Req 14)", () => {
  it("SAVECRAFT_APP_URL is the real app origin, not a dead path", () => {
    expect(SAVECRAFT_APP_URL).toBe("https://my.savecraft.gg");
    expect(SAVECRAFT_APP_URL).not.toContain("/settings");
  });

  it("reconnectAdapterAction points at the real dashboard, never /settings", () => {
    const msg = reconnectAdapterAction("Path of Exile");
    expect(msg).toContain("https://my.savecraft.gg");
    expect(msg).toContain("Path of Exile");
    expect(msg).not.toContain(DEAD);
  });

  it("connectAdapterGuidance gives ordered steps incl. refresh_save, never /settings", () => {
    const msg = connectAdapterGuidance("Path of Exile");
    expect(msg).toContain("https://my.savecraft.gg");
    expect(msg).toContain("refresh_save");
    expect(msg).not.toContain(DEAD);
  });

  it("ggg-api token_expired userAction uses the real dashboard URL", async () => {
    let thrown: unknown;
    try {
      await ensureGggAccessToken(
        { accessToken: "old", expiresAt: "2000-01-01T00:00:00Z" },
        {} as unknown as Env,
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AdapterError);
    const action = (thrown as AdapterError).userAction ?? "";
    expect(action).toContain("https://my.savecraft.gg");
    expect(action).not.toContain(DEAD);
  });

  it("build_planner never-connected guidance points at the real dashboard", async () => {
    await cleanAll();
    const result = await buildPlannerModule.execute(
      { user_id: "nobody", character: "current" },
      poeEnv(),
    );
    expect(result.type).toBe("text");
    if (result.type !== "text") throw new Error("unreachable");
    expect(result.content).toContain("https://my.savecraft.gg");
    expect(result.content).not.toContain(DEAD);
  });

  it("build_planner needs-sign-in guidance points at the real dashboard", async () => {
    const result = await buildPlannerModule.execute(
      { character: "current" },
      poeEnv(),
    );
    expect(result.type).toBe("text");
    if (result.type !== "text") throw new Error("unreachable");
    expect(result.content).toContain("https://my.savecraft.gg");
    expect(result.content).not.toContain(DEAD);
  });

  it("poeAdapter exists (sanity import guard)", () => {
    expect(poeAdapter.gameId).toBe("poe");
  });
});

describe("PoE reference descriptions (epic Req 11)", () => {
  const NOTE = "connected their Path of Exile account";

  it("build_planner still leads with the connected-account workflow", () => {
    expect(buildPlannerModule.description).toContain(NOTE);
  });

  for (const mod of [
    gemSearchModule,
    modSearchModule,
    passiveTreeModule,
    uniqueSearchModule,
    economyModule,
  ]) {
    it(`${mod.id} description notes the connected-account workflow`, () => {
      expect(mod.description).toContain("connected");
      expect(mod.description).toContain("build_planner");
      expect(mod.description).toContain("character");
    });
  }
});

describe("setup_help surfaces PoE as OAuth-connectable (Req 11)", () => {
  it("api_games lists poe and the setup blurb uses the real URL", async () => {
    const { getInfo } = await import("../src/mcp/tools");
    const result = await getInfo(poeEnv(), "no-such-user", "setup");
    const data = JSON.parse(result.content[0]!.text) as {
      setup?: { api_games?: { setup: string; available_games: { game_id: string }[] } };
    };
    const apiGames = data.setup?.api_games;
    expect(apiGames).toBeTruthy();
    expect(apiGames!.available_games.map((g) => g.game_id)).toContain("poe");
    expect(apiGames!.setup).toContain("my.savecraft.gg");
    expect(apiGames!.setup).not.toContain(DEAD);
  });
});
