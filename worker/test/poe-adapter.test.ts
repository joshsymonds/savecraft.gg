import { describe, expect, it } from "vitest";

import { poeAdapter } from "../../plugins/poe/adapter";
import { AdapterError } from "../src/adapters/adapter";
import { adapters } from "../src/adapters/registry";
import type { Env } from "../src/types";

const env = { GGG_CLIENT_ID: "test-client" } as unknown as Env;

describe("PoE adapter skeleton", () => {
  it("is registered as 'poe' and implements ApiAdapter identity", () => {
    expect(adapters.poe).toBe(poeAdapter);
    expect(poeAdapter.gameId).toBe("poe");
    expect(poeAdapter.gameName).toBe("Path of Exile");
  });

  it("getOAuthConfig returns GGG endpoints, both scopes, and the env clientId", () => {
    const cfg = poeAdapter.getOAuthConfig("pc", env);
    expect(cfg.authorizeUrl).toBe("https://www.pathofexile.com/oauth/authorize");
    expect(cfg.tokenUrl).toBe("https://www.pathofexile.com/oauth/token");
    expect(cfg.scopes).toEqual(["account:characters", "account:profile"]);
    expect(cfg.clientId).toBe("test-client");
  });

  it("getOAuthConfig clientId is empty string when env var is unset", () => {
    const cfg = poeAdapter.getOAuthConfig("pc", {} as unknown as Env);
    expect(cfg.clientId).toBe("");
  });

  it("discoverSaves rejects with a typed AdapterError placeholder", async () => {
    await expect(poeAdapter.discoverSaves("tok", "pc")).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof AdapterError && error.code === "api_unavailable",
    );
  });

  it("fetchState rejects with a typed AdapterError placeholder", async () => {
    await expect(
      poeAdapter.fetchState(
        { characterId: "x", region: "pc", credentials: { accessToken: "t" } },
        env,
      ),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof AdapterError && error.code === "api_unavailable",
    );
  });
});
