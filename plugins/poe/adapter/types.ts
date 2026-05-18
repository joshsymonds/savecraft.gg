/**
 * GGG OAuth Character types (PoE1, realm "pc").
 *
 * Mirrors the subset consumed by the Go transformer in
 * cmd/pob-server/pobimport.go (`oauthCharacter`/`oauthPassives`). The
 * adapter passes the raw character object straight through to
 * pob-server `/import`, so these types describe what the GGG
 * `GET /character/<name>` endpoint returns — not a reshaped form.
 *
 * Only fields the adapter or pob-server actually reads are typed;
 * everything else GGG returns is ignored.
 */

/** GGG `passives` sub-object — opaque to the adapter, consumed by PoB. */
export interface GggPassives {
  hashes?: number[];
  hashes_ex?: number[];
  mastery_effects?: Record<string, unknown>;
  jewel_data?: Record<string, unknown>;
  skill_overrides?: Record<string, unknown>;
  alternate_ascendancy?: number;
}

/** A GGG item property, e.g. { name: "Level", values: [["20", 0]] }. */
export interface GggItemProperty {
  name: string;
  values: [string, number][];
}

/** One item from `equipment` / `inventory` / `jewels`. Passed through verbatim. */
export interface GggItem {
  id?: string;
  name?: string;
  typeLine?: string;
  baseType?: string;
  rarity?: string;
  inventoryId?: string;
  frameType?: number;
  ilvl?: number;
  /** Gem-only: true for support gems (socketedItems entries). */
  support?: boolean;
  properties?: GggItemProperty[];
  implicitMods?: string[];
  explicitMods?: string[];
  sockets?: unknown[];
  socketedItems?: GggItem[];
}

/** GGG `GET /character/<name>` response character object. */
export interface GggCharacter {
  name: string;
  /** Ascendancy name once ascended, else the base class name. */
  class: string;
  league: string;
  level: number;
  realm?: string;
  equipment?: GggItem[];
  inventory?: GggItem[];
  jewels?: GggItem[];
  passives?: GggPassives;
}

/** One entry of the GGG `GET /character` list response. */
export interface GggCharacterListEntry {
  /** Stable 64-hex id — survives renames; used as the reconcile key. */
  id: string;
  name: string;
  class: string;
  league: string;
  level: number;
  realm?: string;
  expired?: boolean;
  deleted?: boolean;
}

export interface GggCharacterListResponse {
  characters: GggCharacterListEntry[];
}
