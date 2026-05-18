/**
 * Section mappers: GGG OAuth Character → GameState sections for AI
 * consumption. Pure functions — no HTTP, no env, no side effects
 * (mirrors plugins/wow/adapter/sections.ts). fetchState (task #10)
 * composes these; the raw PoB XML never flows through here — only the
 * AI-visible build_id + summary, via buildPobSection.
 */

import type { GameStateSection } from "../../../worker/src/adapters/adapter";
import type { GggCharacter, GggItem } from "./types";

function gemProp(item: GggItem, name: string): string | undefined {
  return item.properties?.find((p) => p.name === name)?.values?.[0]?.[0];
}

/** Parse a leading integer out of a property string ("20", "+20%"). */
function propInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = /-?\d+/.exec(value);
  return match ? Number(match[0]) : undefined;
}

export function mapCharacterOverview(char: GggCharacter): GameStateSection {
  return {
    description: "Character identity: class, ascendancy, league, level.",
    data: {
      name: char.name,
      class: char.class,
      league: char.league,
      level: char.level,
      realm: char.realm ?? "pc",
    },
  };
}

export function mapGear(char: GggCharacter): GameStateSection {
  const items = (char.equipment ?? []).map((item) => ({
    slot: item.inventoryId ?? "",
    name: item.name || item.typeLine || item.baseType || "",
    base: item.baseType ?? item.typeLine ?? "",
    rarity: item.rarity ?? "",
    implicits: item.implicitMods ?? [],
    explicits: item.explicitMods ?? [],
  }));
  return {
    description: "Equipped items by slot, with implicit and explicit mods.",
    data: { items },
  };
}

export function mapPassives(char: GggCharacter): GameStateSection {
  const p = char.passives;
  return {
    description:
      "Passive tree summary: allocated node count, cluster/mastery usage. " +
      "Use build_planner for the full tree.",
    data: {
      allocated: p?.hashes?.length ?? 0,
      cluster_nodes: p?.hashes_ex?.length ?? 0,
      masteries: p?.mastery_effects ? Object.keys(p.mastery_effects).length : 0,
      alternate_ascendancy: p?.alternate_ascendancy ?? 0,
    },
  };
}

export function mapSkills(char: GggCharacter): GameStateSection {
  const groups = (char.equipment ?? [])
    .filter((item) => (item.socketedItems?.length ?? 0) > 0)
    .map((item) => ({
      slot: item.inventoryId ?? "",
      gems: (item.socketedItems ?? []).map((gem) => ({
        name: gem.typeLine ?? gem.baseType ?? "",
        level: propInt(gemProp(gem, "Level")) ?? 0,
        quality: propInt(gemProp(gem, "Quality")) ?? 0,
        support: gem.support === true,
      })),
    }));
  return {
    description: "Skill gem socket groups (active skills and their supports).",
    data: { groups },
  };
}

export function mapJewels(char: GggCharacter): GameStateSection {
  const jewels = (char.jewels ?? []).map((jewel) => ({
    name: jewel.name || jewel.typeLine || "",
    base: jewel.baseType ?? jewel.typeLine ?? "",
    mods: jewel.explicitMods ?? [],
  }));
  return {
    description: "Socketed jewels.",
    data: { jewels },
  };
}

/**
 * The AI-visible build section: the content-addressed pob-server
 * build_id plus PoB's computed summary (DPS/Life/resists/…). The raw
 * PoB XML is NEVER included here — it lives only in poe_build_snapshot.
 */
export function buildPobSection(
  buildId: string,
  summary: Record<string, unknown>,
): GameStateSection {
  return {
    description:
      "Path of Building analysis of the imported character. build_id can be " +
      "passed to the build_planner reference module for deeper analysis.",
    data: { build_id: buildId, ...summary },
  };
}
