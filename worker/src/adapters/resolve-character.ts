/**
 * Adapter-generic refresh-target resolution.
 *
 * Both the REST refresh route (index.ts) and the MCP refresh tool
 * (tools.ts) need to turn a save's linked_characters row into the
 * FetchParams an adapter receives. The adapter's own stable id and the
 * discovery metadata are stored verbatim by reconcile — pass them
 * through untouched; each adapter interprets its own characterId /
 * metadata. No game-specific reconstruction lives here.
 */

export interface LinkedCharacterInfo {
  character_id: string;
  character_name: string;
  metadata: string | null;
}

export interface ResolvedCharacter {
  /** Stable adapter id (linked_characters.character_id). */
  characterId: string;
  /** Discovered display name, original case. */
  characterName: string;
  /** metadata.region if present, else "" (adapter applies its default). */
  region: string;
  /** Parsed linked_characters.metadata. */
  metadata: Record<string, unknown>;
}

/**
 * Resolve the refresh target from a linked_characters row, or null when
 * the save has no active linked character — the caller turns null into
 * a user-facing "not linked, reconnect" error (the unrefreshable-save
 * guard, formerly the WoW-only `!realmSlug` check).
 */
export function resolveAdapterCharacter(
  linkedChar: LinkedCharacterInfo | null,
): ResolvedCharacter | null {
  if (!linkedChar?.character_id) return null;

  let metadata: Record<string, unknown> = {};
  if (linkedChar.metadata) {
    try {
      metadata = JSON.parse(linkedChar.metadata) as Record<string, unknown>;
    } catch {
      // Malformed metadata — adapters fall back to their own defaults.
      metadata = {};
    }
  }

  return {
    characterId: linkedChar.character_id,
    characterName: linkedChar.character_name,
    region: typeof metadata.region === "string" ? metadata.region : "",
    metadata,
  };
}
