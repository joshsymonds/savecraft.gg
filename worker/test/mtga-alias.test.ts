import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { normalizeGameId } from "../src/gameid";

import {
  cleanAll,
  closeWs,
  connectDaemonWs,
  requirePayload,
  seedSource,
  sendProto,
  waitForProtoMessage,
} from "./helpers";

function sourceOnlineMsg() {
  return {
    payload: {
      $case: "sourceOnline" as const,
      sourceOnline: {
        version: "0.1.0",
        timestamp: undefined,
        platform: "",
        os: "",
        arch: "",
        hostname: "",
        device: "",
      },
    },
  };
}

async function pushSaveWithGameId(
  daemon: WebSocket,
  gameId: string,
  saveName: string,
  parsedAt: Date,
): Promise<{ saveUuid: string; echoedGameId: string }> {
  sendProto(daemon, {
    payload: {
      $case: "pushSave",
      pushSave: {
        identity: { name: saveName, extra: {} },
        summary: `${saveName} summary`,
        gameId,
        parsedAt,
        sections: [
          {
            name: "overview",
            description: "test",
            data: { hello: "world" },
          },
        ],
      },
    },
  });
  const resultMsg = await waitForProtoMessage(daemon);
  const result = requirePayload(resultMsg, "pushSaveResult");
  return { saveUuid: result.saveUuid, echoedGameId: result.gameId };
}

describe("normalizeGameId", () => {
  it("rewrites mtga to magic", () => {
    expect(normalizeGameId("mtga")).toBe("magic");
  });

  it("rewrites mtg typo to magic", () => {
    expect(normalizeGameId("mtg")).toBe("magic");
  });

  it("leaves magic untouched", () => {
    expect(normalizeGameId("magic")).toBe("magic");
  });

  it("leaves unrelated game ids untouched", () => {
    expect(normalizeGameId("d2r")).toBe("d2r");
    expect(normalizeGameId("rimworld")).toBe("rimworld");
    expect(normalizeGameId("")).toBe("");
  });

  it("is case-sensitive (does not match MTGA in caps)", () => {
    expect(normalizeGameId("MTGA")).toBe("MTGA");
  });
});

describe("mtga→magic alias on PushSave", () => {
  beforeEach(cleanAll);

  it("stores a push with gameId='mtga' under game_id='magic'", async () => {
    const userUuid = "mtga-alias-user-1";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    sendProto(daemon, sourceOnlineMsg());
    await waitForProtoMessage(daemon);
    await new Promise((r) => setTimeout(r, 50));

    const { saveUuid } = await pushSaveWithGameId(
      daemon,
      "mtga",
      "DraftDodger",
      new Date("2026-04-17T12:00:00Z"),
    );

    expect(saveUuid).toBeTruthy();

    const save = await env.DB.prepare("SELECT game_id, save_name FROM saves WHERE uuid = ?")
      .bind(saveUuid)
      .first<{ game_id: string; save_name: string }>();
    expect(save).not.toBeNull();
    expect(save!.game_id).toBe("magic");
    expect(save!.save_name).toBe("DraftDodger");

    await closeWs(daemon);
  });

  it("echoes game_id='magic' in PushSaveResult when daemon sent 'mtga'", async () => {
    const userUuid = "mtga-alias-user-2";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    sendProto(daemon, sourceOnlineMsg());
    await waitForProtoMessage(daemon);
    await new Promise((r) => setTimeout(r, 50));

    const { echoedGameId } = await pushSaveWithGameId(
      daemon,
      "mtga",
      "MelHunts",
      new Date("2026-04-17T12:00:00Z"),
    );
    expect(echoedGameId).toBe("magic");

    await closeWs(daemon);
  });

  it("dedups 'mtga' push against existing 'magic' row (same user, same save_name)", async () => {
    const userUuid = "mtga-alias-user-3";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    sendProto(daemon, sourceOnlineMsg());
    await waitForProtoMessage(daemon);
    await new Promise((r) => setTimeout(r, 50));

    // First push as 'magic'
    const first = await pushSaveWithGameId(
      daemon,
      "magic",
      "SharedChar",
      new Date("2026-04-17T10:00:00Z"),
    );

    // Second push for the same character but daemon sends 'mtga' — alias must
    // dedup onto the existing magic row, not create a second row.
    const second = await pushSaveWithGameId(
      daemon,
      "mtga",
      "SharedChar",
      new Date("2026-04-17T11:00:00Z"),
    );

    expect(second.saveUuid).toBe(first.saveUuid);

    const rows = await env.DB.prepare(
      "SELECT uuid, game_id FROM saves WHERE user_uuid = ? AND save_name = ?",
    )
      .bind(userUuid, "SharedChar")
      .all<{ uuid: string; game_id: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.game_id).toBe("magic");

    await closeWs(daemon);
  });

  it("leaves non-mtga game_ids untouched (pass-through)", async () => {
    const userUuid = "mtga-alias-user-4";
    const { sourceToken } = await seedSource(userUuid);

    const daemon = await connectDaemonWs(sourceToken);
    sendProto(daemon, sourceOnlineMsg());
    await waitForProtoMessage(daemon);
    await new Promise((r) => setTimeout(r, 50));

    const { saveUuid, echoedGameId } = await pushSaveWithGameId(
      daemon,
      "d2r",
      "Barb",
      new Date("2026-04-17T12:00:00Z"),
    );
    expect(echoedGameId).toBe("d2r");

    const save = await env.DB.prepare("SELECT game_id FROM saves WHERE uuid = ?")
      .bind(saveUuid)
      .first<{ game_id: string }>();
    expect(save!.game_id).toBe("d2r");

    await closeWs(daemon);
  });
});

describe("migration 0047 data rename (idempotency)", () => {
  beforeEach(cleanAll);

  // The migration itself runs at DB-init time via Miniflare. We can't replay
  // that here, so instead we re-seed a pre-migration state (mtga rows inserted
  // directly, bypassing the alias) and run the same UPDATE statements a second
  // time — this proves the SQL is safe under double-application.
  const RENAME_SQL = [
    "UPDATE saves SET game_id = 'magic' WHERE game_id = 'mtga'",
    "UPDATE source_configs SET game_id = 'magic' WHERE game_id = 'mtga'",
  ];

  it("converts saves and source_configs rows from mtga to magic", async () => {
    const { sourceUuid } = await seedSource("mig-user-1");
    const saveUuid = crypto.randomUUID();

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid) VALUES (?, ?, 'mtga', 'MTG Arena', 'LegacyChar', 'old summary', ?, ?)",
      ).bind(saveUuid, "mig-user-1", "2026-04-10T00:00:00Z", sourceUuid),
      env.DB.prepare(
        "INSERT INTO source_configs (source_uuid, game_id, save_path, enabled) VALUES (?, 'mtga', '/mtga/path', 1)",
      ).bind(sourceUuid),
    ]);

    for (const sql of RENAME_SQL) {
      await env.DB.prepare(sql).run();
    }

    const save = await env.DB.prepare("SELECT game_id FROM saves WHERE uuid = ?")
      .bind(saveUuid)
      .first<{ game_id: string }>();
    expect(save!.game_id).toBe("magic");

    const config = await env.DB.prepare(
      "SELECT game_id FROM source_configs WHERE source_uuid = ? AND save_path = '/mtga/path'",
    )
      .bind(sourceUuid)
      .first<{ game_id: string }>();
    expect(config!.game_id).toBe("magic");
  });

  it("surfaces the UNIQUE (user_uuid, game_id, save_name) constraint if both mtga and magic rows exist for the same save", async () => {
    // Documents migration behavior under a collision. Production was verified
    // collision-free on 2026-04-17 before deploy; this test exists so a future
    // reader sees that a collision would fail the UPDATE (surfacing the issue
    // at deploy time), not silently drop data or create divergent rows.
    const { sourceUuid } = await seedSource("mig-user-3");
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid) VALUES (?, ?, 'mtga', 'MTG Arena', 'ClashChar', 's', ?, ?)",
      ).bind(crypto.randomUUID(), "mig-user-3", "2026-04-10T00:00:00Z", sourceUuid),
      env.DB.prepare(
        "INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid) VALUES (?, ?, 'magic', 'Magic', 'ClashChar', 's', ?, ?)",
      ).bind(crypto.randomUUID(), "mig-user-3", "2026-04-15T00:00:00Z", sourceUuid),
    ]);

    await expect(
      env.DB.prepare("UPDATE saves SET game_id = 'magic' WHERE game_id = 'mtga'").run(),
    ).rejects.toThrow(/UNIQUE|constraint/i);
  });

  it("is a no-op on a second run (no mtga rows remain after first run)", async () => {
    const { sourceUuid } = await seedSource("mig-user-2");
    await env.DB.prepare(
      "INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid) VALUES (?, ?, 'mtga', 'MTG Arena', 'Char', 's', ?, ?)",
    )
      .bind(crypto.randomUUID(), "mig-user-2", "2026-04-10T00:00:00Z", sourceUuid)
      .run();

    // First run — expect rows changed.
    for (const sql of RENAME_SQL) await env.DB.prepare(sql).run();

    // Second run — no rows to touch.
    for (const sql of RENAME_SQL) {
      const result = await env.DB.prepare(sql).run();
      expect(result.meta.changes).toBe(0);
    }

    const remaining = await env.DB.prepare(
      "SELECT COUNT(*) as n FROM saves WHERE game_id = 'mtga'",
    ).first<{ n: number }>();
    expect(remaining!.n).toBe(0);
  });
});
