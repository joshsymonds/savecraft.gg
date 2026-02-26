import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const TEST_USER = "push-test-user";

function pushRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("https://test-host/api/v1/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_USER}`,
      "X-Game": "d2r",
      "X-Parsed-At": "2026-02-25T21:30:00Z",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const validGameState = {
  identity: {
    character_name: "Hammerdin",
    game_id: "d2r",
    extra: { class: "Paladin", level: 89 },
  },
  summary: "Hammerdin, Level 89 Paladin",
  sections: {
    character_overview: {
      description: "Level, class, difficulty",
      data: { name: "Hammerdin", class: "Paladin", level: 89 },
    },
  },
};

describe("Push API", () => {
  it("accepts valid game state and returns 201", async () => {
    const resp = await SELF.fetch(pushRequest(validGameState));
    expect(resp.status).toBe(201);

    const body = await resp.json<{ save_uuid: string; snapshot_timestamp: string }>();
    expect(body.save_uuid).toBeTruthy();
    expect(body.snapshot_timestamp).toBe("2026-02-25T21:30:00Z");
  });

  it("upserts save in D1 and reuses save UUID", async () => {
    // First push
    const resp1 = await SELF.fetch(pushRequest(validGameState));
    expect(resp1.status).toBe(201);
    const body1 = await resp1.json<{ save_uuid: string }>();

    // Second push for the same character — should reuse save UUID
    const updated = {
      ...validGameState,
      summary: "Hammerdin, Level 90 Paladin",
    };
    const resp2 = await SELF.fetch(
      pushRequest(updated, { "X-Parsed-At": "2026-02-25T22:00:00Z" })
    );
    expect(resp2.status).toBe(201);
    const body2 = await resp2.json<{ save_uuid: string }>();

    expect(body2.save_uuid).toBe(body1.save_uuid);

    // D1 should have exactly one save row for this character
    const rows = await env.DB.prepare(
      "SELECT * FROM saves WHERE user_uuid = ? AND game_id = 'd2r' AND character_name = 'Hammerdin'"
    ).bind(TEST_USER).all();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!["summary"]).toBe("Hammerdin, Level 90 Paladin");
  });

  it("rejects missing auth", async () => {
    const resp = await SELF.fetch(
      new Request("https://test-host/api/v1/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Game": "d2r" },
        body: JSON.stringify(validGameState),
      })
    );
    expect(resp.status).toBe(401);
  });

  it("rejects missing X-Game header", async () => {
    const resp = await SELF.fetch(
      pushRequest(validGameState, { "X-Game": "" })
    );
    expect(resp.status).toBe(400);
  });

  it("rejects body without identity", async () => {
    const resp = await SELF.fetch(
      pushRequest({ sections: { foo: { description: "bar", data: {} } } })
    );
    expect(resp.status).toBe(400);
  });

  it("rejects body without sections", async () => {
    const resp = await SELF.fetch(
      pushRequest({ identity: { character_name: "Test", game_id: "d2r" } })
    );
    expect(resp.status).toBe(400);
  });
});
