/**
 * MTG Arena collection_diff — native reference module.
 *
 * Computes the wildcard cost to complete a target decklist given the player's
 * collection. Resolves card names and rarities from D1 mtga_cards table.
 */

import type { Env } from "../../../worker/src/types";
import type { NativeReferenceModule, ReferenceResult } from "../../../worker/src/reference/types";

interface DeckEntry {
  name: string;
  count: number;
}

interface CollectionEntry {
  arenaId: number;
  count: number;
}

export const collectionDiffModule: NativeReferenceModule = {
  id: "collection_diff",
  name: "Collection Diff",
  description: [
    "Compute the wildcard cost to craft a target decklist.",
    "Provide the deck (card names + counts) and the player's collection (arena IDs + counts).",
    "Returns missing cards grouped by rarity and total wildcard cost.",
  ].join(" "),
  parameters: {
    deck: {
      type: "array",
      description: "Target deck: array of {name: string, count: number}.",
    },
    collection: {
      type: "array",
      description: "Player's collection: array of {arenaId: number, count: number}.",
    },
    deck_section: {
      type: "string",
      description:
        'Section name containing the deck (e.g., "deck:Mono Black"). Requires save_id. Alternative to passing deck inline.',
    },
    save_id: {
      type: "string",
      description:
        "Save UUID. Required when using deck_section to reference a deck from save data.",
    },
  },

  sectionMappings: [
    {
      sectionParam: "deck_section",
      extract: (sectionData: unknown) => {
        const data = sectionData as Record<string, unknown>;
        const result: Record<string, unknown> = {};
        if (Array.isArray(data.cards)) result.deck = data.cards;
        return result;
      },
    },
  ],

  async execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult> {
    const deck = (query.deck as DeckEntry[]) ?? [];
    const collection = (query.collection as CollectionEntry[]) ?? [];

    // Build collection lookup: arena_id → count owned
    // Then resolve arena_id → card name via D1
    const owned = new Map<string, number>(); // lowercase name → count
    const rarityByName = new Map<string, string>(); // lowercase name → rarity

    if (collection.length > 0) {
      // Batch lookup arena_ids from D1
      const arenaIds = collection.map((c) => c.arenaId);
      // Query in chunks of 50 to stay within D1 limits
      for (let i = 0; i < arenaIds.length; i += 50) {
        const chunk = arenaIds.slice(i, i + 50);
        const placeholders = chunk.map((_, j) => `?${j + 1}`).join(",");
        const rows = await env.DB
          .prepare(`SELECT arena_id, front_face_name AS name, rarity FROM mtga_cards WHERE arena_id IN (${placeholders})`)
          .bind(...chunk)
          .all<{ arena_id: number; name: string; rarity: string }>();

        const nameById = new Map(rows.results.map((r) => [r.arena_id, r]));

        for (const c of collection.slice(i, i + 50)) {
          const card = nameById.get(c.arenaId);
          if (card) {
            const key = card.name.toLowerCase();
            owned.set(key, (owned.get(key) ?? 0) + c.count);
            rarityByName.set(key, card.rarity);
          }
        }
      }
    }

    // Batch lookup rarity for deck cards not in collection
    const missingNames = deck
      .filter((e) => !rarityByName.has(e.name.toLowerCase()))
      .map((e) => e.name);
    for (let i = 0; i < missingNames.length; i += 50) {
      const chunk = missingNames.slice(i, i + 50);
      const placeholders = chunk.map((_, j) => `?${j + 1}`).join(",");
      const rows = await env.DB
        .prepare(`SELECT front_face_name AS name, rarity FROM mtga_cards WHERE is_default = 1 AND front_face_name COLLATE NOCASE IN (${placeholders})`)
        .bind(...chunk)
        .all<{ name: string; rarity: string }>();
      for (const row of rows.results) {
        rarityByName.set(row.name.toLowerCase(), row.rarity);
      }
    }

    // Compute diff
    const missing: Array<{ name: string; count: number; rarity: string }> = [];
    const wildcardCost = { common: 0, uncommon: 0, rare: 0, mythic: 0, unknown: 0, total: 0 };
    const unresolvedCards: string[] = [];

    for (const entry of deck) {
      const key = entry.name.toLowerCase();
      const have = owned.get(key) ?? 0;
      const need = entry.count - have;
      if (need <= 0) continue;

      let rarity = rarityByName.get(key) ?? "";
      if (rarity === "") {
        rarity = "unknown";
        if (!unresolvedCards.includes(entry.name)) {
          unresolvedCards.push(entry.name);
        }
      }
      missing.push({ name: entry.name, count: need, rarity });

      switch (rarity) {
        case "common": wildcardCost.common += need; break;
        case "uncommon": wildcardCost.uncommon += need; break;
        case "rare": wildcardCost.rare += need; break;
        case "mythic": wildcardCost.mythic += need; break;
        case "unknown": wildcardCost.unknown += need; break;
      }
      wildcardCost.total += need;
    }

    return {
      type: "structured",
      data: { missing, wildcardCost, unresolvedCards },
    };
  },
};
