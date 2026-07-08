/**
 * Section mappers: GGG PoE2 OAuth Character → GameState sections for AI
 * consumption. Pure functions — no HTTP, no env, no side effects (mirrors
 * plugins/poe/adapter/sections.ts). fetchState (index.ts) composes these.
 *
 * No inventory mapper: GGG's PoE2 character API does not return
 * unequipped items (the epic anti-pattern this plugin deliberately
 * avoids).
 */

import type { GameStateSection } from "../../../worker/src/adapters/adapter";
import type { Poe2Character, Poe2Item } from "./types";

function gemProp(item: Poe2Item, name: string): string | undefined {
  return item.properties?.find((p) => p.name === name)?.values?.[0]?.[0];
}

export function mapCharacterOverview(char: Poe2Character): GameStateSection {
  return {
    description: "Character identity: class, league, level.",
    data: {
      name: char.name,
      class: char.class,
      league: char.league,
      level: char.level,
      realm: char.realm ?? "poe2",
    },
  };
}

export function mapGear(char: Poe2Character): GameStateSection {
  const items = (char.equipment ?? []).map((item) => {
    // Provenance-distinct mod sources beyond implicit/explicit/rune —
    // included only when non-empty, to keep gear lean for AI consumption
    // (mirrors the level/quality convention in mapSkills below).
    const desecratedMods = item.desecratedMods ?? [];
    const bondedMods = item.bondedMods ?? [];
    const enchantMods = item.enchantMods ?? [];
    const fracturedMods = item.fracturedMods ?? [];
    const craftedMods = item.craftedMods ?? [];
    const mutatedMods = item.mutatedMods ?? [];
    const utilityMods = item.utilityMods ?? [];
    return {
      slot: item.inventoryId ?? "",
      name: item.name || item.typeLine || item.baseType || "",
      base: item.baseType ?? item.typeLine ?? "",
      rarity: item.rarity ?? "",
      implicits: item.implicitMods ?? [],
      explicits: item.explicitMods ?? [],
      // PoE2-only: rune/jewel sockets on gear (distinct from the gem
      // sockets on skill items, which live under `skills`/mapSkills).
      sockets: (item.sockets ?? []).map((socket) => ({
        type: socket.type ?? "",
        item: socket.item ?? "",
      })),
      runeMods: item.runeMods ?? [],
      ...(desecratedMods.length > 0 ? { desecratedMods } : {}),
      ...(bondedMods.length > 0 ? { bondedMods } : {}),
      ...(enchantMods.length > 0 ? { enchantMods } : {}),
      ...(fracturedMods.length > 0 ? { fracturedMods } : {}),
      ...(craftedMods.length > 0 ? { craftedMods } : {}),
      ...(mutatedMods.length > 0 ? { mutatedMods } : {}),
      ...(utilityMods.length > 0 ? { utilityMods } : {}),
    };
  });
  return {
    description:
      "Equipped items by slot, with rune/jewel socket types, and mods by provenance " +
      "(implicit, explicit, rune, desecrated, bonded, enchant, fractured, crafted, mutated, utility).",
    data: { items },
  };
}

export function mapSkills(char: Poe2Character): GameStateSection {
  const bindings = (char.skills ?? []).map((item) => {
    const level = gemProp(item, "Level");
    const quality = gemProp(item, "Quality");
    return {
      skill: item.gemSkill || item.typeLine || item.baseType || "",
      // GGG's gemSockets is ?array of string (each entry always "W"), not
      // a count — this section still surfaces "how many sockets" under
      // the same key, derived from the array length.
      gemSockets: (item.gemSockets ?? []).length,
      ...(level !== undefined ? { level } : {}),
      ...(quality !== undefined ? { quality } : {}),
      grantedSkills: (item.grantedSkills ?? []).map((p) => ({
        name: p.name,
        values: p.values.map(([value]) => value),
      })),
      tabs: (item.gemTabs ?? []).map((tab) => ({
        name: tab.name ?? "",
        pages: (tab.pages ?? []).map((page) => page.skillName ?? "").filter((name) => name !== ""),
      })),
      supports: (item.socketedItems ?? []).map((support) => {
        const supportLevel = gemProp(support, "Level");
        const supportQuality = gemProp(support, "Quality");
        return {
          name: support.gemSkill || support.typeLine || support.baseType || "",
          ...(supportLevel !== undefined ? { level: supportLevel } : {}),
          ...(supportQuality !== undefined ? { quality: supportQuality } : {}),
        };
      }),
    };
  });
  return {
    description:
      "Skill-binding screen: socketed/uncut skill gems, their gem tabs, and attached " +
      "supports (PoE2 gems live here, not on gear like PoE1).",
    data: { bindings },
  };
}

export function mapPassives(char: Poe2Character): GameStateSection {
  const p = char.passives;
  const specialisations: Record<string, number> = {};
  const specialisationHashes: Record<string, number[]> = {};
  for (const [set, nodes] of Object.entries(p?.specialisations ?? {})) {
    specialisations[set] = nodes.length;
    specialisationHashes[set] = nodes;
  }
  return {
    description:
      "Passive tree summary: allocated node hashes (and counts), plus specialisation set " +
      "hashes (and sizes).",
    data: {
      allocated: p?.hashes?.length ?? 0,
      hashes: p?.hashes ?? [],
      specialisations,
      specialisationHashes,
      quest_stats: p?.quest_stats ?? {},
    },
  };
}

/**
 * The AI-visible build section: the content-addressed pob-server
 * build_id plus PoB2's computed summary (DPS/Life/resists/…). The raw
 * PoB2 XML is NEVER included here — it lives only in
 * poe2_build_snapshot. Mirrors plugins/poe/adapter/sections.ts's
 * buildPobSection.
 */
export function buildPobSection(
  buildId: string,
  summary: Record<string, unknown>,
): GameStateSection {
  return {
    description:
      "Path of Building 2 analysis of the imported character. build_id can be " +
      "passed to the build_planner reference module for deeper analysis.",
    data: { build_id: buildId, ...summary },
  };
}
