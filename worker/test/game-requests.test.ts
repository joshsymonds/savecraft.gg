import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";

async function insertRequest(
  userUuid: string,
  gameSlug: string,
  gameName: string,
  updatedAt: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO game_requests (user_uuid, game_slug, game_name, updated_at) VALUES (?, ?, ?, ?)`,
  )
    .bind(userUuid, gameSlug, gameName, updatedAt)
    .run();
}

async function insertBlock(gameSlug: string): Promise<void> {
  await env.DB.prepare(`INSERT INTO game_request_blocks (game_slug) VALUES (?)`)
    .bind(gameSlug)
    .run();
}

describe("GET /api/v1/game-requests", () => {
  beforeEach(cleanAll);

  it("returns an empty list when no requests exist", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/game-requests");
    expect(resp.status).toBe(200);
    const body = await resp.json<{ requests: unknown[] }>();
    expect(body.requests).toEqual([]);
  });

  it("tallies distinct players per slug and orders by count desc", async () => {
    await insertRequest("user-1", "elden-ring", "Elden Ring", "2026-01-01 00:00:00");
    await insertRequest("user-2", "elden-ring", "Elden Ring", "2026-01-02 00:00:00");
    await insertRequest("user-3", "hades-2", "Hades 2", "2026-01-01 00:00:00");

    const resp = await SELF.fetch("https://test-host/api/v1/game-requests");
    expect(resp.status).toBe(200);
    const body = await resp.json<{ requests: { slug: string; name: string; count: number }[] }>();
    expect(body.requests).toEqual([
      { slug: "elden-ring", name: "Elden Ring", count: 2 },
      { slug: "hades-2", name: "Hades 2", count: 1 },
    ]);
  });

  it("uses the most-recently-updated row's game_name for a slug", async () => {
    await insertRequest("user-1", "eldenring", "eldenring", "2026-01-01 00:00:00");
    await insertRequest("user-2", "eldenring", "Elden Ring", "2026-01-05 00:00:00");

    const resp = await SELF.fetch("https://test-host/api/v1/game-requests");
    const body = await resp.json<{ requests: { slug: string; name: string; count: number }[] }>();
    expect(body.requests).toEqual([{ slug: "eldenring", name: "Elden Ring", count: 2 }]);
  });

  it("excludes slugs present in game_request_blocks", async () => {
    await insertRequest("user-1", "blocked-game", "Blocked Game", "2026-01-01 00:00:00");
    await insertRequest("user-2", "visible-game", "Visible Game", "2026-01-01 00:00:00");
    await insertBlock("blocked-game");

    const resp = await SELF.fetch("https://test-host/api/v1/game-requests");
    const body = await resp.json<{ requests: { slug: string; name: string; count: number }[] }>();
    expect(body.requests).toEqual([{ slug: "visible-game", name: "Visible Game", count: 1 }]);
  });

  it("never includes details or user_uuid in the response body", async () => {
    await env.DB.prepare(
      `INSERT INTO game_requests (user_uuid, game_slug, game_name, details, updated_at) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind("user-1", "secret-game", "Secret Game", "please add this game", "2026-01-01 00:00:00")
      .run();

    const resp = await SELF.fetch("https://test-host/api/v1/game-requests");
    const text = await resp.text();
    expect(text).not.toContain("details");
    expect(text).not.toContain("user_uuid");
    expect(text).not.toContain("user-1");
    expect(text).not.toContain("please add this game");
  });

  it("caps the response at 200 entries, highest-count first", async () => {
    for (let i = 0; i < 205; i++) {
      const slug = `game-${i.toString().padStart(3, "0")}`;
      // A handful of distinct counts so ordering is still asserted, not just truncation.
      const players = i < 5 ? 5 - i : 1;
      for (let p = 0; p < players; p++) {
        await insertRequest(`user-${i}-${p}`, slug, slug, "2026-01-01 00:00:00");
      }
    }

    const resp = await SELF.fetch("https://test-host/api/v1/game-requests");
    expect(resp.status).toBe(200);
    const body = await resp.json<{ requests: { slug: string; name: string; count: number }[] }>();
    expect(body.requests).toHaveLength(200);
    expect(body.requests.slice(0, 5).map((r) => r.count)).toEqual([5, 4, 3, 2, 1]);
    expect(body.requests.slice(0, 5).map((r) => r.slug)).toEqual([
      "game-000",
      "game-001",
      "game-002",
      "game-003",
      "game-004",
    ]);
  });

  it("does not match POST", async () => {
    // Falls through to the protected-endpoints router, which returns 401 for
    // an unauthenticated request to an unmatched path (not a 404).
    const resp = await SELF.fetch("https://test-host/api/v1/game-requests", { method: "POST" });
    expect(resp.status).toBe(401);
  });
});
