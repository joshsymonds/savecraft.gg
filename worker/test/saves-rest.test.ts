import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";

const TEST_USER = "saves-rest-user";

function pushSave(
  characterName: string,
  summary: string,
  parsedAt: string,
): Request {
  return new Request("https://test-host/api/v1/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_USER}`,
      "X-Game": "d2r",
      "X-Parsed-At": parsedAt,
    },
    body: JSON.stringify({
      identity: { character_name: characterName, game_id: "d2r" },
      summary,
      sections: {
        character_overview: {
          description: "Level, class, difficulty",
          data: { name: characterName, class: "Paladin", level: 89 },
        },
        skills: {
          description: "Skill allocations",
          data: { hammer: 20, vigor: 20 },
        },
      },
    }),
  });
}

function getSaves(): Request {
  return new Request("https://test-host/api/v1/saves", {
    headers: { Authorization: `Bearer ${TEST_USER}` },
  });
}

function getSave(saveId: string): Request {
  return new Request(`https://test-host/api/v1/saves/${saveId}`, {
    headers: { Authorization: `Bearer ${TEST_USER}` },
  });
}

describe("Saves REST API", () => {
  beforeEach(cleanAll);

  it("returns empty saves list for new user", async () => {
    const resp = await SELF.fetch(getSaves());
    expect(resp.status).toBe(200);
    const body = await resp.json<{ saves: unknown[] }>();
    expect(body.saves).toEqual([]);
  });

  it("returns CORS headers", async () => {
    const resp = await SELF.fetch(getSaves());
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("handles OPTIONS preflight", async () => {
    const resp = await SELF.fetch(
      new Request("https://test-host/api/v1/saves", { method: "OPTIONS" }),
    );
    expect(resp.status).toBe(204);
    expect(resp.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("requires authentication", async () => {
    const resp = await SELF.fetch(
      new Request("https://test-host/api/v1/saves"),
    );
    expect(resp.status).toBe(401);
  });

  it("lists pushed saves", async () => {
    // Push two saves
    await SELF.fetch(pushSave("Hammerdin", "Level 89 Paladin", "2026-02-25T21:00:00Z"));
    await SELF.fetch(pushSave("Frostbite", "Level 31 Sorc", "2026-02-25T20:00:00Z"));

    const resp = await SELF.fetch(getSaves());
    expect(resp.status).toBe(200);

    const body = await resp.json<{
      saves: { id: string; game_id: string; character_name: string; summary: string; last_updated: string }[];
    }>();

    expect(body.saves).toHaveLength(2);
    // Ordered by last_updated DESC
    const first = body.saves[0]!;
    const second = body.saves[1]!;
    expect(first.character_name).toBe("Hammerdin");
    expect(first.game_id).toBe("d2r");
    expect(first.summary).toBe("Level 89 Paladin");
    expect(second.character_name).toBe("Frostbite");
  });

  it("gets a single save with sections", async () => {
    const pushResp = await SELF.fetch(
      pushSave("Hammerdin", "Level 89 Paladin", "2026-02-25T21:00:00Z"),
    );
    const { save_uuid } = await pushResp.json<{ save_uuid: string }>();

    const resp = await SELF.fetch(getSave(save_uuid));
    expect(resp.status).toBe(200);

    const body = await resp.json<{
      id: string;
      game_id: string;
      character_name: string;
      summary: string;
      sections: { name: string; description: string }[];
    }>();

    expect(body.id).toBe(save_uuid);
    expect(body.character_name).toBe("Hammerdin");
    expect(body.sections).toHaveLength(2);

    const sectionNames = body.sections.map((s) => s.name).toSorted((a, b) => a.localeCompare(b));
    expect(sectionNames).toEqual(["character_overview", "skills"]);
  });

  it("returns 404 for unknown save", async () => {
    const resp = await SELF.fetch(getSave("nonexistent-uuid"));
    expect(resp.status).toBe(404);
  });

  it("isolates saves between users", async () => {
    // Push as TEST_USER
    await SELF.fetch(pushSave("Hammerdin", "Level 89 Paladin", "2026-02-25T21:00:00Z"));

    // List as different user
    const resp = await SELF.fetch(
      new Request("https://test-host/api/v1/saves", {
        headers: { Authorization: "Bearer other-user" },
      }),
    );
    const body = await resp.json<{ saves: unknown[] }>();
    expect(body.saves).toHaveLength(0);
  });
});
