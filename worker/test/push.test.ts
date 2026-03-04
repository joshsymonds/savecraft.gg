import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, seedDevice } from "./helpers";

async function gzipBody(data: string): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(data));
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

let DEVICE_UUID: string;
let DEVICE_TOKEN: string;

function pushRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("https://test-host/api/v1/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEVICE_TOKEN}`,
      "X-Game": "d2r",
      "X-Parsed-At": "2026-02-25T21:30:00Z",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const validGameState = {
  identity: {
    saveName: "Hammerdin",
    gameId: "d2r",
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
  beforeEach(async () => {
    await cleanAll();
    const device = await seedDevice();
    DEVICE_UUID = device.deviceUuid;
    DEVICE_TOKEN = device.deviceToken;
  });

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
    const resp2 = await SELF.fetch(pushRequest(updated, { "X-Parsed-At": "2026-02-25T22:00:00Z" }));
    expect(resp2.status).toBe(201);
    const body2 = await resp2.json<{ save_uuid: string }>();

    expect(body2.save_uuid).toBe(body1.save_uuid);

    // D1 should have exactly one save row for this character
    const rows = await env.DB.prepare(
      "SELECT * FROM saves WHERE device_uuid = ? AND game_id = 'd2r' AND save_name = 'Hammerdin'",
    )
      .bind(DEVICE_UUID)
      .all();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.summary).toBe("Hammerdin, Level 90 Paladin");
  });

  it("rejects missing auth", async () => {
    const resp = await SELF.fetch(
      new Request("https://test-host/api/v1/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Game": "d2r" },
        body: JSON.stringify(validGameState),
      }),
    );
    expect(resp.status).toBe(401);
  });

  it("rejects missing X-Game header", async () => {
    const resp = await SELF.fetch(pushRequest(validGameState, { "X-Game": "" }));
    expect(resp.status).toBe(400);
  });

  it("rejects body without identity", async () => {
    const resp = await SELF.fetch(
      pushRequest({ sections: { foo: { description: "bar", data: {} } } }),
    );
    expect(resp.status).toBe(400);
  });

  it("rejects body without sections", async () => {
    const resp = await SELF.fetch(pushRequest({ identity: { saveName: "Test", gameId: "d2r" } }));
    expect(resp.status).toBe(400);
  });

  it("does not update latest.json when incoming timestamp is older", async () => {
    // Use a unique character to isolate this test
    const character = {
      ...validGameState,
      identity: { ...validGameState.identity, saveName: "TimestampGuardChar" },
      summary: "Newer push",
    };

    // Push with a newer timestamp first
    const resp1 = await SELF.fetch(
      pushRequest(character, { "X-Parsed-At": "2026-02-25T22:00:00Z" }),
    );
    expect(resp1.status).toBe(201);
    const body1 = await resp1.json<{ save_uuid: string }>();

    // Push with an older timestamp — snapshot written, but latest.json should NOT update
    const olderCharacter = { ...character, summary: "Older push" };
    const resp2 = await SELF.fetch(
      pushRequest(olderCharacter, { "X-Parsed-At": "2026-02-25T20:00:00Z" }),
    );
    expect(resp2.status).toBe(201);

    // latest.json should still have the newer push's data
    const latestKey = `devices/${DEVICE_UUID}/saves/${body1.save_uuid}/latest.json`;
    const latest = await env.SAVES.get(latestKey);
    expect(latest).not.toBeNull();
    const latestData = await latest!.json<{ summary: string }>();
    expect(latestData.summary).toBe("Newer push");

    // D1 summary should also still reflect the newer push
    const row = await env.DB.prepare("SELECT summary, last_updated FROM saves WHERE uuid = ?")
      .bind(body1.save_uuid)
      .first<{ summary: string; last_updated: string }>();
    expect(row!.summary).toBe("Newer push");
    expect(row!.last_updated).toBe("2026-02-25T22:00:00Z");
  });

  it("updates latest.json when incoming timestamp is newer", async () => {
    const character = {
      ...validGameState,
      identity: { ...validGameState.identity, saveName: "TimestampNewerChar" },
      summary: "First push",
    };

    // Push with an older timestamp first
    const resp1 = await SELF.fetch(
      pushRequest(character, { "X-Parsed-At": "2026-02-25T20:00:00Z" }),
    );
    expect(resp1.status).toBe(201);
    const body1 = await resp1.json<{ save_uuid: string }>();

    // Push with a newer timestamp — should update latest.json
    const newerCharacter = { ...character, summary: "Second push" };
    const resp2 = await SELF.fetch(
      pushRequest(newerCharacter, { "X-Parsed-At": "2026-02-25T22:00:00Z" }),
    );
    expect(resp2.status).toBe(201);

    const latestKey = `devices/${DEVICE_UUID}/saves/${body1.save_uuid}/latest.json`;
    const latest = await env.SAVES.get(latestKey);
    const latestData = await latest!.json<{ summary: string }>();
    expect(latestData.summary).toBe("Second push");
  });

  it("stores daemon-format identity (camelCase gameId) in R2 snapshot", async () => {
    const daemonBody = {
      identity: { saveName: "FormatCheck", gameId: "d2r" },
      summary: "Format test",
      sections: { overview: { description: "test", data: {} } },
    };
    const resp = await SELF.fetch(pushRequest(daemonBody));
    expect(resp.status).toBe(201);
    const { save_uuid } = await resp.json<{ save_uuid: string }>();

    // Read back from R2 and verify identity uses camelCase (daemon convention)
    const latestKey = `devices/${DEVICE_UUID}/saves/${save_uuid}/latest.json`;
    const object = await env.SAVES.get(latestKey);
    expect(object).not.toBeNull();
    const snapshot = await object!.json<{ identity: Record<string, unknown> }>();
    expect(snapshot.identity.gameId).toBe("d2r");
    expect(snapshot.identity.saveName).toBe("FormatCheck");
    // snake_case game_id should NOT be present — daemon sends camelCase
    expect(snapshot.identity.game_id).toBeUndefined();
  });

  it("accepts gzip-compressed push body", async () => {
    const compressed = await gzipBody(JSON.stringify(validGameState));

    const resp = await SELF.fetch(
      new Request("https://test-host/api/v1/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
          Authorization: `Bearer ${DEVICE_TOKEN}`,
          "X-Game": "d2r",
          "X-Parsed-At": "2026-02-25T21:30:00Z",
        },
        body: compressed,
      }),
    );
    expect(resp.status).toBe(201);
    const body = await resp.json<{ save_uuid: string }>();
    expect(body.save_uuid).toBeTruthy();
  });

  it("always writes the immutable snapshot regardless of timestamp order", async () => {
    const character = {
      ...validGameState,
      identity: { ...validGameState.identity, saveName: "SnapshotAlwaysChar" },
    };

    // Push newer first
    const resp1 = await SELF.fetch(
      pushRequest(character, { "X-Parsed-At": "2026-02-25T22:00:00Z" }),
    );
    expect(resp1.status).toBe(201);
    const body1 = await resp1.json<{ save_uuid: string; snapshot_timestamp: string }>();

    // Push older — should still return 201 (snapshot written)
    const resp2 = await SELF.fetch(
      pushRequest(
        { ...character, summary: "Older snapshot" },
        { "X-Parsed-At": "2026-02-25T20:00:00Z" },
      ),
    );
    expect(resp2.status).toBe(201);
    expect(body1.snapshot_timestamp).toBe("2026-02-25T22:00:00Z");
  });
});
