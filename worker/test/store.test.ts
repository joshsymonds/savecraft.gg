import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { storePush } from "../src/store";
import type { SectionInput } from "../src/store";

import { cleanAll, seedSource } from "./helpers";

describe("storePush", () => {
  beforeEach(cleanAll);

  it("accepts null user_uuid for unlinked sources", async () => {
    const { sourceUuid } = await seedSource(null);

    const sections: Record<string, SectionInput> = {
      overview: { description: "Overview", data: { level: 42 } },
    };

    const { saveUuid } = await storePush(
      env,
      null,
      sourceUuid,
      "d2r",
      "Atmus",
      "Level 42 Paladin",
      new Date().toISOString(),
      sections,
    );

    expect(saveUuid).toBeTruthy();

    const save = await env.DB.prepare("SELECT * FROM saves WHERE uuid = ?")
      .bind(saveUuid)
      .first<{ uuid: string; user_uuid: string | null; save_name: string }>();

    expect(save).not.toBeNull();
    expect(save!.user_uuid).toBeNull();
    expect(save!.save_name).toBe("Atmus");

    // Sections should also be stored
    const section = await env.DB.prepare(
      "SELECT * FROM sections WHERE save_uuid = ?",
    )
      .bind(saveUuid)
      .first<{ name: string; data: string }>();

    expect(section).not.toBeNull();
    expect(section!.name).toBe("overview");
  });

  it("deduplicates unlinked saves by source_uuid + game_id + save_name", async () => {
    const { sourceUuid } = await seedSource(null);

    const sections: Record<string, SectionInput> = {
      overview: { description: "Overview", data: { level: 1 } },
    };

    const first = await storePush(
      env,
      null,
      sourceUuid,
      "d2r",
      "Atmus",
      "Level 1",
      "2026-01-01T00:00:00Z",
      sections,
    );

    const second = await storePush(
      env,
      null,
      sourceUuid,
      "d2r",
      "Atmus",
      "Level 2",
      "2026-01-02T00:00:00Z",
      { overview: { description: "Overview", data: { level: 2 } } },
    );

    // Same save UUID reused
    expect(second.saveUuid).toBe(first.saveUuid);

    // Summary updated
    const save = await env.DB.prepare("SELECT summary FROM saves WHERE uuid = ?")
      .bind(first.saveUuid)
      .first<{ summary: string }>();
    expect(save!.summary).toBe("Level 2");
  });

  it("sections FK cascade survives migration table recreation", async () => {
    const { sourceUuid } = await seedSource("test-user");

    const { saveUuid } = await storePush(
      env,
      "test-user",
      sourceUuid,
      "d2r",
      "TestChar",
      "Level 10",
      new Date().toISOString(),
      { stats: { description: "Stats", data: { str: 25 } } },
    );

    // Verify section exists
    const section = await env.DB.prepare(
      "SELECT 1 FROM sections WHERE save_uuid = ?",
    )
      .bind(saveUuid)
      .first();
    expect(section).not.toBeNull();

    // Delete save — sections should cascade
    await env.DB.prepare("DELETE FROM saves WHERE uuid = ?")
      .bind(saveUuid)
      .run();

    const orphanSection = await env.DB.prepare(
      "SELECT 1 FROM sections WHERE save_uuid = ?",
    )
      .bind(saveUuid)
      .first();
    expect(orphanSection).toBeNull();
  });
});
