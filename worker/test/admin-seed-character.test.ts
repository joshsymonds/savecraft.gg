import { env, fetchMock, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { GameState } from "../src/adapters/adapter";
import { seedCharacter, validateSeedInput } from "../src/admin/seed-character";

import { cleanAll } from "./helpers";

const ADMIN_KEY = "test-admin-key-secret";

function adminPost(path: string, body: Record<string, unknown>, key?: string): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  return SELF.fetch(`https://test-host${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** Seed an adapter source in D1 and return its UUID. */
async function seedAdapterSource(userUuid: string): Promise<string> {
  const sourceUuid = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO sources (source_uuid, user_uuid, token_hash, source_kind, can_rescan, can_receive_config)
     VALUES (?, ?, ?, 'adapter', 0, 0)`,
  )
    .bind(sourceUuid, userUuid, "unused-adapter-hash")
    .run();
  return sourceUuid;
}

const VALID_INPUT = {
  userUuid: "seed-test-user",
  gameId: "wow",
  realmSlug: "illidan",
  characterName: "thrall",
  region: "us",
};

function fakeGameState(): GameState {
  return {
    identity: { saveName: "Thrall-illidan-US", gameId: "wow" },
    summary: "Enhancement Shaman, Level 80",
    sections: {
      character_overview: {
        description: "Character overview",
        data: { name: "Thrall", level: 80, class: "Shaman" },
      },
      equipped_gear: {
        description: "Equipped items",
        data: { items: [] },
      },
    },
  };
}

describe("POST /admin/seed-character", () => {
  beforeEach(cleanAll);

  describe("HTTP endpoint auth and validation", () => {
    it("returns 401 without admin key", async () => {
      const resp = await adminPost("/admin/seed-character", VALID_INPUT);
      expect(resp.status).toBe(401);
    });

    it("returns 401 with wrong admin key", async () => {
      const resp = await adminPost("/admin/seed-character", VALID_INPUT, "wrong-key");
      expect(resp.status).toBe(401);
    });

    it("returns 400 for missing required fields", async () => {
      const resp = await adminPost(
        "/admin/seed-character",
        { userUuid: "seed-test-user", gameId: "wow" },
        ADMIN_KEY,
      );
      expect(resp.status).toBe(400);
    });

    it("returns 400 for unknown game ID", async () => {
      await seedAdapterSource("seed-test-user");
      const resp = await adminPost(
        "/admin/seed-character",
        { ...VALID_INPUT, gameId: "unknown-game" },
        ADMIN_KEY,
      );
      expect(resp.status).toBe(400);
      const body = await resp.json<{ error: string }>();
      expect(body.error).toMatch(/adapter/i);
    });

    it("returns 502 when fetchState fails", async () => {
      await seedAdapterSource(VALID_INPUT.userUuid);

      fetchMock.activate();
      fetchMock.disableNetConnect();
      try {
        fetchMock
          .get("https://oauth.battle.net")
          .intercept({ path: "/token", method: "POST" })
          .reply(200, JSON.stringify({ access_token: "mock-app-token", expires_in: 86_400 }), {
            headers: { "content-type": "application/json" },
          });
        fetchMock
          .get("https://us.api.blizzard.com")
          .intercept({ path: /\/profile\/wow\/character\//, method: "GET" })
          .reply(404, JSON.stringify({ code: 404, type: "BLZWEBAPI00000004" }), {
            headers: { "content-type": "application/json" },
          });

        const resp = await adminPost("/admin/seed-character", VALID_INPUT, ADMIN_KEY);
        expect(resp.status).toBe(502);
        const body = await resp.json<{ error: string }>();
        expect(body.error).toMatch(/fetchState failed/);
      } finally {
        fetchMock.deactivate();
      }
    });
  });

  describe("seedCharacter core logic", () => {
    it("throws SeedError with 404 when user has no adapter source", async () => {
      const input = validateSeedInput(VALID_INPUT);
      await expect(seedCharacter(input, env, fakeGameState(), "World of Warcraft")).rejects.toThrow(
        /adapter source/i,
      );
    });

    it("creates linked_characters, saves, and sections in D1", async () => {
      const sourceUuid = await seedAdapterSource(VALID_INPUT.userUuid);
      const input = validateSeedInput(VALID_INPUT);
      const result = await seedCharacter(input, env, fakeGameState(), "World of Warcraft");

      expect(result.saveUuid).toBeDefined();
      expect(result.summary).toBe("Enhancement Shaman, Level 80");
      expect(result.sections).toContain("character_overview");
      expect(result.sections).toContain("equipped_gear");

      // Verify linked_characters row
      const char = await env.DB.prepare(
        "SELECT character_id, character_name, metadata, active FROM linked_characters WHERE user_uuid = ? AND game_id = ?",
      )
        .bind(VALID_INPUT.userUuid, "wow")
        .first<{
          character_id: string;
          character_name: string;
          metadata: string;
          active: number;
        }>();
      expect(char).not.toBeNull();
      expect(char!.character_id).toBe("seed-illidan-thrall");
      expect(char!.character_name).toBe("thrall");
      expect(char!.active).toBe(1);
      const metadata = JSON.parse(char!.metadata) as Record<string, string>;
      expect(metadata.realm_slug).toBe("illidan");
      expect(metadata.region).toBe("us");

      // Verify save row
      const save = await env.DB.prepare(
        "SELECT uuid, save_name, summary, game_id FROM saves WHERE uuid = ?",
      )
        .bind(result.saveUuid)
        .first<{ uuid: string; save_name: string; summary: string; game_id: string }>();
      expect(save).not.toBeNull();
      expect(save!.save_name).toBe("Thrall-illidan-US");
      expect(save!.game_id).toBe("wow");

      // Verify sections
      const sections = await env.DB.prepare(
        "SELECT name, description FROM sections WHERE save_uuid = ? ORDER BY name",
      )
        .bind(result.saveUuid)
        .all<{ name: string; description: string }>();
      expect(sections.results).toHaveLength(2);
      expect(sections.results.map((s) => s.name)).toEqual(["character_overview", "equipped_gear"]);

      // Verify SourceHub DO received game status via set-game-status call
      const doId = env.SOURCE_HUB.idFromName(sourceUuid);
      const stub = env.SOURCE_HUB.get(doId);
      const statusResp = await stub.fetch(new Request("https://do/debug/state", { method: "GET" }));
      const doState = await statusResp.json<{
        sourceState: { sources: { games: { gameId: string }[] }[] };
      }>();
      // seedCharacter pushes a game status mutation, so sources should be non-empty
      expect(doState.sourceState.sources.length).toBeGreaterThan(0);
      const sourceEntry = doState.sourceState.sources[0]!;
      expect(sourceEntry.games.some((g) => g.gameId === "wow")).toBe(true);
    });

    it("upserts on duplicate character_id", async () => {
      await seedAdapterSource(VALID_INPUT.userUuid);
      const input = validateSeedInput(VALID_INPUT);

      // Seed twice
      await seedCharacter(input, env, fakeGameState(), "World of Warcraft");
      const updatedState = fakeGameState();
      updatedState.summary = "Updated summary";
      const result = await seedCharacter(input, env, updatedState, "World of Warcraft");

      expect(result.summary).toBe("Updated summary");

      // Should still be exactly one linked_characters row
      const count = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM linked_characters WHERE user_uuid = ? AND game_id = ?",
      )
        .bind(VALID_INPUT.userUuid, "wow")
        .first<{ cnt: number }>();
      expect(count!.cnt).toBe(1);
    });
  });
});
