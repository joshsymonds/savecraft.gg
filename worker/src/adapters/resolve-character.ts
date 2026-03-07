/**
 * Shared character context resolution for adapter refresh paths.
 *
 * Both the REST API refresh route (index.ts) and MCP refresh tool (tools.ts)
 * need to resolve realm/region/character name from linked_characters metadata,
 * falling back to parsing save_name. This module provides the single canonical
 * implementation.
 */

export interface CharacterContext {
  realmSlug: string;
  region: string;
  characterName: string;
}

interface LinkedCharacterInfo {
  character_name: string;
  metadata: string | null;
}

/**
 * Resolve realm, region, and character name from linked_characters data,
 * falling back to parsing save_name (format: "Name-realm-REGION").
 *
 * NOTE: save_name.split("-")[0] for character name is WoW-specific.
 * WoW character names cannot contain hyphens. Future adapters with
 * different naming conventions will need their own resolution logic.
 */
export function resolveCharacterContext(
  linkedChar: LinkedCharacterInfo | null,
  saveName: string,
): CharacterContext {
  let realmSlug = "";
  let region = "us";

  if (linkedChar?.metadata) {
    try {
      const meta = JSON.parse(linkedChar.metadata) as Record<string, unknown>;
      realmSlug = typeof meta.realm_slug === "string" ? meta.realm_slug : "";
      region = typeof meta.region === "string" ? meta.region : "us";
    } catch {
      // Malformed metadata — fall through to save_name parsing
    }
  }

  if (!realmSlug) {
    // Fallback: parse from save_name (Name-Realm-REGION)
    const nameParts = saveName.split("-");
    realmSlug = nameParts[1] ?? "";
    region = (nameParts[2] ?? "US").toLowerCase();
  }

  const characterName = (linkedChar?.character_name ?? saveName.split("-")[0] ?? "").toLowerCase();

  return { realmSlug, region, characterName };
}
