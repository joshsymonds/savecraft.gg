import { AdapterError, type GameState } from "../adapters/adapter";
import { adapters } from "../adapters/registry";
import { storePush } from "../store";
import type { Env } from "../types";

/** Timeout for external adapter API calls (30s). */
const FETCH_STATE_TIMEOUT_MS = 30_000;

class SeedError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "SeedError";
    this.statusCode = statusCode;
  }
}

export interface SeedCharacterInput {
  userUuid: string;
  gameId: string;
  realmSlug: string;
  characterName: string;
  region: string;
}

export function validateSeedInput(body: unknown): SeedCharacterInput {
  const b = body as Record<string, string>;
  if (!b.userUuid || !b.gameId || !b.realmSlug || !b.characterName || !b.region) {
    throw new Error("Missing required fields: userUuid, gameId, realmSlug, characterName, region");
  }
  return {
    userUuid: b.userUuid,
    gameId: b.gameId,
    realmSlug: b.realmSlug,
    characterName: b.characterName,
    region: b.region,
  };
}

export async function seedCharacter(
  input: SeedCharacterInput,
  env: Env,
  gameState: GameState,
  gameName: string,
): Promise<{ saveUuid: string; summary: string; sections: string[] }> {
  // Look up existing adapter source.
  // NOTE: Does not filter by game_id — a user has one adapter source shared across all games.
  const source = await env.DB.prepare(
    "SELECT source_uuid FROM sources WHERE user_uuid = ? AND source_kind = 'adapter'",
  )
    .bind(input.userUuid)
    .first<{ source_uuid: string }>();

  if (!source) {
    throw new SeedError("No adapter source found for this user. Complete OAuth flow first.", 404);
  }

  // Insert linked_characters row
  const syntheticCharacterId = `seed-${input.realmSlug}-${input.characterName}`;
  await env.DB.prepare(
    `INSERT INTO linked_characters (user_uuid, game_id, character_id, character_name, metadata, source_uuid, active)
     VALUES (?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(user_uuid, game_id, character_id) DO UPDATE SET
       character_name = excluded.character_name, metadata = excluded.metadata, active = 1`,
  )
    .bind(
      input.userUuid,
      input.gameId,
      syntheticCharacterId,
      input.characterName,
      JSON.stringify({ realm_slug: input.realmSlug, region: input.region }),
      source.source_uuid,
    )
    .run();

  // Store save data via storePush
  const parsedAt = new Date().toISOString();
  const result = await storePush(
    env,
    input.userUuid,
    source.source_uuid,
    input.gameId,
    gameState.identity.saveName,
    gameState.summary,
    parsedAt,
    gameState.sections,
  );

  // Push game status to SourceHub so dashboard updates
  const doId = env.SOURCE_HUB.idFromName(source.source_uuid);
  const stub = env.SOURCE_HUB.get(doId);
  await stub.fetch(
    new Request("https://do/set-game-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Source-UUID": source.source_uuid,
        "X-User-UUID": input.userUuid,
      },
      body: JSON.stringify({ gameId: input.gameId, gameName, status: "watching" }),
    }),
  );

  return {
    saveUuid: result.saveUuid,
    summary: gameState.summary,
    sections: Object.keys(gameState.sections),
  };
}

export async function handleSeedCharacter(request: Request, env: Env): Promise<Response> {
  let input: SeedCharacterInput;
  try {
    input = validateSeedInput(await request.json());
  } catch {
    return Response.json(
      { error: "Missing required fields: userUuid, gameId, realmSlug, characterName, region" },
      { status: 400 },
    );
  }

  const adapter = adapters[input.gameId];
  if (!adapter) {
    return Response.json({ error: `No adapter found for game: ${input.gameId}` }, { status: 400 });
  }

  // Fetch live character data via client credentials.
  // accessToken is empty because the WoW adapter uses getAppToken() (client credentials)
  // internally — it does not need a user OAuth token for fetchState.
  let gameState: GameState;
  try {
    gameState = await Promise.race([
      adapter.fetchState(
        {
          characterId: `${input.realmSlug}/${input.characterName}`,
          region: input.region,
          credentials: { accessToken: "" },
        },
        env,
      ),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("fetchState timed out"));
        }, FETCH_STATE_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    const detail = error instanceof AdapterError ? error.code : "upstream_error";
    return Response.json({ error: `fetchState failed: ${detail}` }, { status: 502 });
  }

  try {
    const result = await seedCharacter(input, env, gameState, adapter.gameName);
    return Response.json({ ...result, characterName: input.characterName });
  } catch (error) {
    if (error instanceof SeedError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
