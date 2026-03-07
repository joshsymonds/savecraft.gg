import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";
import { sha256Hex } from "../src/auth";
import { reconcileCharacters } from "../src/adapters/reconcile";
import type { DiscoveredSave } from "../src/adapters/adapter";

const USER_UUID = "reconcile-user";
const GAME_ID = "wow";

async function seedAdapterSource(userUuid: string): Promise<string> {
  const sourceUuid = crypto.randomUUID();
  const tokenHash = await sha256Hex(`sct_adapter_${sourceUuid}`);
  await env.DB.prepare(
    `INSERT INTO sources (source_uuid, user_uuid, token_hash, source_kind, can_rescan, can_receive_config)
     VALUES (?, ?, ?, 'adapter', 0, 0)`,
  )
    .bind(sourceUuid, userUuid, tokenHash)
    .run();
  return sourceUuid;
}

async function seedLinkedCharacter(
  userUuid: string,
  gameId: string,
  sourceUuid: string,
  characterId: string,
  characterName: string,
  metadata: Record<string, unknown>,
  active = 1,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO linked_characters (user_uuid, game_id, character_id, character_name, metadata, source_uuid, active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      userUuid,
      gameId,
      characterId,
      characterName,
      JSON.stringify(metadata),
      sourceUuid,
      active,
    )
    .run();
}

async function seedSave(
  userUuid: string,
  gameId: string,
  saveName: string,
  sourceUuid: string,
): Promise<string> {
  const saveUuid = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated, last_source_uuid)
     VALUES (?, ?, ?, 'World of Warcraft', ?, '', datetime('now'), ?)`,
  )
    .bind(saveUuid, userUuid, gameId, saveName, sourceUuid)
    .run();
  return saveUuid;
}

function disc(
  characterId: string,
  name: string,
  realm: string,
  region = "us",
): DiscoveredSave {
  return {
    saveName: `${name}-${realm}-${region.toUpperCase()}`,
    characterId,
    displayName: name,
    metadata: { realm_slug: realm, region, class: "Warrior", level: 80 },
  };
}

describe("reconcileCharacters", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  it("adds new characters", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    const discovered = [disc("100", "Thrall", "thrall")];

    const result = await reconcileCharacters(
      env,
      USER_UUID,
      GAME_ID,
      sourceUuid,
      "World of Warcraft",
      discovered,
    );

    expect(result.added).toEqual(["100"]);
    expect(result.renamed).toEqual([]);
    expect(result.deactivated).toEqual([]);
    expect(result.reactivated).toEqual([]);

    // Verify linked_character was created
    const char = await env.DB.prepare(
      "SELECT character_name, active FROM linked_characters WHERE character_id = ? AND user_uuid = ?",
    )
      .bind("100", USER_UUID)
      .first<{ character_name: string; active: number }>();
    expect(char?.character_name).toBe("Thrall");
    expect(char?.active).toBe(1);

    // Verify save was created
    const save = await env.DB.prepare(
      "SELECT save_name FROM saves WHERE user_uuid = ? AND game_id = ? AND save_name = ?",
    )
      .bind(USER_UUID, GAME_ID, "Thrall-thrall-US")
      .first<{ save_name: string }>();
    expect(save).toBeTruthy();
  });

  it("detects renamed characters", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    await seedLinkedCharacter(USER_UUID, GAME_ID, sourceUuid, "100", "OldName", {
      realm_slug: "thrall",
      region: "us",
    });
    await seedSave(USER_UUID, GAME_ID, "OldName-thrall-US", sourceUuid);

    // Same character_id, different name
    const discovered = [disc("100", "NewName", "thrall")];

    const result = await reconcileCharacters(
      env,
      USER_UUID,
      GAME_ID,
      sourceUuid,
      "World of Warcraft",
      discovered,
    );

    expect(result.renamed).toEqual(["100"]);
    expect(result.added).toEqual([]);

    // Verify linked_character name updated
    const char = await env.DB.prepare(
      "SELECT character_name FROM linked_characters WHERE character_id = ? AND user_uuid = ?",
    )
      .bind("100", USER_UUID)
      .first<{ character_name: string }>();
    expect(char?.character_name).toBe("NewName");
  });

  it("deactivates missing characters", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    await seedLinkedCharacter(USER_UUID, GAME_ID, sourceUuid, "100", "Thrall", {
      realm_slug: "thrall",
      region: "us",
    });
    await seedSave(USER_UUID, GAME_ID, "Thrall-thrall-US", sourceUuid);

    // Empty discovery — character no longer on account
    const result = await reconcileCharacters(
      env,
      USER_UUID,
      GAME_ID,
      sourceUuid,
      "World of Warcraft",
      [],
    );

    expect(result.deactivated).toEqual(["100"]);

    // Verify soft-deleted
    const char = await env.DB.prepare(
      "SELECT active FROM linked_characters WHERE character_id = ? AND user_uuid = ?",
    )
      .bind("100", USER_UUID)
      .first<{ active: number }>();
    expect(char?.active).toBe(0);

    // Save should still exist (preserved)
    const save = await env.DB.prepare(
      "SELECT uuid FROM saves WHERE user_uuid = ? AND game_id = ? AND save_name = ?",
    )
      .bind(USER_UUID, GAME_ID, "Thrall-thrall-US")
      .first<{ uuid: string }>();
    expect(save).toBeTruthy();
  });

  it("reactivates previously deleted characters", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);
    // Character exists but is inactive
    await seedLinkedCharacter(
      USER_UUID,
      GAME_ID,
      sourceUuid,
      "100",
      "Thrall",
      { realm_slug: "thrall", region: "us" },
      0, // inactive
    );
    await seedSave(USER_UUID, GAME_ID, "Thrall-thrall-US", sourceUuid);

    const discovered = [disc("100", "Thrall", "thrall")];

    const result = await reconcileCharacters(
      env,
      USER_UUID,
      GAME_ID,
      sourceUuid,
      "World of Warcraft",
      discovered,
    );

    expect(result.reactivated).toEqual(["100"]);
    expect(result.added).toEqual([]);

    // Verify reactivated
    const char = await env.DB.prepare(
      "SELECT active FROM linked_characters WHERE character_id = ? AND user_uuid = ?",
    )
      .bind("100", USER_UUID)
      .first<{ active: number }>();
    expect(char?.active).toBe(1);
  });

  it("handles mixed operations in one reconciliation", async () => {
    const sourceUuid = await seedAdapterSource(USER_UUID);

    // Existing: char 100 (active), char 200 (active), char 300 (inactive)
    await seedLinkedCharacter(USER_UUID, GAME_ID, sourceUuid, "100", "Stays", {
      realm_slug: "thrall",
      region: "us",
    });
    await seedLinkedCharacter(USER_UUID, GAME_ID, sourceUuid, "200", "GoesAway", {
      realm_slug: "thrall",
      region: "us",
    });
    await seedLinkedCharacter(
      USER_UUID,
      GAME_ID,
      sourceUuid,
      "300",
      "ComesBack",
      { realm_slug: "thrall", region: "us" },
      0,
    );

    // Discovery: 100 still there, 200 gone, 300 back, 400 new
    const discovered = [
      disc("100", "Stays", "thrall"),
      disc("300", "ComesBack", "thrall"),
      disc("400", "BrandNew", "proudmoore"),
    ];

    const result = await reconcileCharacters(
      env,
      USER_UUID,
      GAME_ID,
      sourceUuid,
      "World of Warcraft",
      discovered,
    );

    expect(result.added).toEqual(["400"]);
    expect(result.deactivated).toEqual(["200"]);
    expect(result.reactivated).toEqual(["300"]);
    expect(result.renamed).toEqual([]);
  });
});
