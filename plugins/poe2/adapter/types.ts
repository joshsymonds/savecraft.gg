/**
 * GGG OAuth Character types (PoE2, realm "poe2").
 *
 * Describes what GGG's `GET /character/poe2/<name>` endpoint returns, per
 * the documented shape at https://www.pathofexile.com/developer/docs/reference
 * (verified July 2026). PoE2 diverges from PoE1 (see plugins/poe/adapter/types.ts)
 * in two structural ways this adapter has to account for:
 *
 *   - Socketed/uncut skill gems live on `character.skills`, a top-level
 *     array of Item — NOT nested under `equipment[].socketedItems` like
 *     PoE1's gem sockets.
 *   - `inventory`/`rucksack` (the unequipped stash-on-character views) are
 *     PoE1-only and absent from the PoE2 character payload entirely — GGG
 *     removed them for PoE2. No inventory section is produced here.
 *
 * Only fields the adapter's section mappers actually read are typed;
 * everything else GGG returns is ignored.
 */

/** GGG `passives` sub-object for PoE2 — allocated tree hashes plus the
 *  PoE2-only specialisation (Ascendancy-like) sets and quest-granted stats. */
export interface Poe2Passives {
  hashes?: number[];
  /** Keyed by set label ("set1", "set2", "set3"); each value is the list
   *  of allocated node ids for that specialisation set. */
  specialisations?: Record<string, number[]>;
  /** Quest-granted passive stat rewards (e.g. bandit/quest choices). Opaque. */
  quest_stats?: Record<string, unknown>;
}

/** A GGG item property, e.g. { name: "Level", values: [["20", 0]] }. */
export interface Poe2ItemProperty {
  name: string;
  values: [string, number][];
}

/** A socket on a PoE2 item: what kind of socket it is, and what's socketed
 *  into it (a rune, a jewel color, a soul core, or a gem). */
export interface Poe2ItemSocket {
  type?: "gem" | "jewel" | "rune" | string;
  item?:
    | "ruby"
    | "emerald"
    | "sapphire"
    | "rune"
    | "soulcore"
    | "activegem"
    | "supportgem"
    | string;
}

/** One page of a gem tab — the actual skill-gem binding (name, tooltip,
 *  computed properties/stats) for a loadout. */
export interface Poe2GemTabPage {
  skillName?: string;
  description?: string;
  properties?: Poe2ItemProperty[];
  stats?: string[];
}

/** One gem tab (loadout) on a `character.skills` entry. */
export interface Poe2GemTab {
  name?: string;
  pages?: Poe2GemTabPage[];
}

/** One item from `equipment` or `skills`. Passed through mostly verbatim;
 *  PoE2-only fields below have no PoE1 equivalent. */
export interface Poe2Item {
  id?: string;
  name?: string;
  typeLine?: string;
  baseType?: string;
  rarity?: string;
  inventoryId?: string;
  frameType?: number;
  ilvl?: number;
  /** Gem-only: true for support gems. */
  support?: boolean;
  properties?: Poe2ItemProperty[];
  implicitMods?: string[];
  explicitMods?: string[];
  sockets?: Poe2ItemSocket[];
  socketedItems?: Poe2Item[];

  // PoE2-only fields (absent on PoE1's Item shape).
  /** Skill-gem loadouts: name + pages, only present on `skills` entries. */
  gemTabs?: Poe2GemTab[];
  gemBackground?: string;
  gemSkill?: string;
  gemSockets?: number;
  runeMods?: string[];
  bondedMods?: string[];
  desecratedMods?: string[];
  sanctified?: boolean;
  doubleCorrupted?: boolean;
  unidentifiedTier?: number;
  weaponRequirements?: Poe2ItemProperty[];
  supportGemRequirements?: Poe2ItemProperty[];
  grantedSkills?: unknown[];
}

/** GGG `GET /character/poe2/<name>` response character object. */
export interface Poe2Character {
  name: string;
  class: string;
  league: string;
  level: number;
  realm?: string;
  equipment?: Poe2Item[];
  /** The skill-binding screen — socketed/uncut skill gems (PoE2-only;
   *  PoE1's gems live under equipment[].socketedItems instead). */
  skills?: Poe2Item[];
  passives?: Poe2Passives;
  metadata?: { version?: string };
}

/** One entry of the GGG `GET /character/poe2` list response. */
export interface Poe2CharacterListEntry {
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

export interface Poe2CharacterListResponse {
  characters: Poe2CharacterListEntry[];
}

/** GGG `GET /character/poe2/<name>` wraps the character in this envelope. */
export interface Poe2CharacterResponse {
  character: Poe2Character;
}
