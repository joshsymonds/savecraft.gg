/**
 * Section mappers: GGG PoE2 OAuth Character → GameState sections for AI
 * consumption. Pure functions — no HTTP, no env, no side effects (mirrors
 * plugins/poe/adapter/sections.ts). fetchState (index.ts) composes these.
 *
 * No inventory mapper: GGG's PoE2 character API does not return
 * unequipped items (the epic anti-pattern this plugin deliberately
 * avoids). No pob_build mapper either — PoB2 enrichment is a separate,
 * future epic.
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
  const items = (char.equipment ?? []).map((item) => ({
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
  }));
  return {
    description:
      "Equipped items by slot, with rune/jewel socket types, rune mods, and explicit mods.",
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
  for (const [set, nodes] of Object.entries(p?.specialisations ?? {})) {
    specialisations[set] = nodes.length;
  }
  return {
    description: "Passive tree summary: allocated node count and specialisation set sizes.",
    data: {
      allocated: p?.hashes?.length ?? 0,
      specialisations,
      quest_stats: p?.quest_stats ?? {},
    },
  };
}
