/**
 * combo_search — native reference module.
 *
 * Searches EDHREC combo data stored in the magic_edh_combos table. Supports
 * filtering by commander (fuzzy name), card name (FTS over combo card lists),
 * color identity, and minimum popularity.
 *
 * Data source: EDHREC.com — combo data curated from Commander Spellbook and
 * aggregated across popular deck databases.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";
import { fts5Safe } from "../../../worker/src/reference/fts5";
import { safeParseJSON } from "../../../worker/src/reference/json";
import { resolveCommander } from "./commander-resolve";
import { buildSubsetExpr, isValidColors } from "./wubrg";

const DEFAULT_LIMIT = 20;

interface ComboRow {
  commander_id: string;
  commander_name: string;
  commander_slug: string;
  combo_id: string;
  card_names: string;
  card_ids: string;
  colors: string;
  results: string;
  deck_count: number;
  percentage: number;
  bracket_score: number | null;
}

export const comboSearchModule: NativeReferenceModule = {
  id: "combo_search",
  name: "Commander Combo Search",
  description: [
    "Find Magic: The Gathering Commander (EDH) combos by commander, card name, or color identity.",
    "USE PROACTIVELY when a player asks 'what combos work in my deck', 'what combos include X card', or wants to add combo lines to their commander build.",
    "Each combo returns the card list, color identity, result text (what the combo does), deck count (how many decks run it on EDHREC), and a bracket score (1-4, the Commander rules committee's power level indicator).",
    "At least one of `commander`, `card`, or `colors` must be provided. Results are ordered by popularity (deck count DESC).",
  ].join(" "),
  parameters: {
    commander: {
      type: "string",
      description:
        "Commander name, fuzzy match. Filters combos to those registered under this commander on EDHREC.",
    },
    card: {
      type: "string",
      description:
        "Card name (substring match against combo card lists via FTS5). Use to find combos involving a specific card — e.g. 'Thassa's Oracle'.",
    },
    colors: {
      type: "string",
      description:
        "Color identity string (e.g. 'BG', 'WUBRG', or '' for colorless). Returns combos whose color requirements are a SUBSET of the given colors — a 'BG' deck sees BG combos, B-only, G-only, and colorless combos, but not WG.",
    },
    min_deck_count: {
      type: "integer",
      description:
        "Minimum deck count threshold — filters out obscure combos below this popularity.",
    },
    limit: {
      type: "integer",
      description: "Max combos returned (default 20, max 100).",
    },
  },

  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const commanderQuery = ((query.commander as string) ?? "").trim();
    const cardQuery = ((query.card as string) ?? "").trim();
    const colorsQuery =
      typeof query.colors === "string" ? (query.colors as string).trim() : "";
    const hasColors = typeof query.colors === "string";
    const minDeckCount =
      typeof query.min_deck_count === "number"
        ? (query.min_deck_count as number)
        : 0;
    const limit = Math.max(
      1,
      Math.min(100, (query.limit as number | undefined) ?? DEFAULT_LIMIT),
    );

    if (!commanderQuery && !cardQuery && !hasColors) {
      return {
        type: "text",
        content:
          "combo_search requires at least one of: commander (commander name), card (card name), or colors (color identity).",
      };
    }

    // Build the query progressively
    const wheres: string[] = [];
    const binds: unknown[] = [];

    // Commander filter — resolve to commander_id via shared helper.
    if (commanderQuery) {
      const commanderRow = await resolveCommander(env, commanderQuery);
      if (!commanderRow) {
        return {
          type: "text",
          content: `Commander not found: "${commanderQuery}". EDHREC only tracks commanders with deck data.`,
        };
      }
      wheres.push("c.commander_id = ?");
      binds.push(commanderRow.scryfall_id);
    }

    // Card filter — FTS5 MATCH on combos_fts, join back via combo_id
    let fromClause =
      "FROM magic_edh_combos c JOIN magic_edh_commanders cmd ON cmd.scryfall_id = c.commander_id";
    if (cardQuery) {
      fromClause =
        "FROM magic_edh_combos_fts f JOIN magic_edh_combos c ON c.commander_id = f.commander_id AND c.combo_id = f.combo_id JOIN magic_edh_commanders cmd ON cmd.scryfall_id = c.commander_id";
      wheres.push("f.card_names_text MATCH ?");
      binds.push(fts5Safe(cardQuery));
    }

    // Colors filter — subset semantics via the shared wubrg helper. Combo
    // colors are already stored uppercase (from EDHREC), so no UPPER() needed.
    if (hasColors) {
      const userColors = colorsQuery.toUpperCase();
      if (!isValidColors(userColors)) {
        return {
          type: "text",
          content: `Invalid colors value: "${colorsQuery}". Use WUBRG letters only (e.g. "BG", "WUBRG", or "" for colorless).`,
        };
      }
      wheres.push(`${buildSubsetExpr(userColors, "c.colors")} = ''`);
    }

    if (minDeckCount > 0) {
      wheres.push("c.deck_count >= ?");
      binds.push(minDeckCount);
    }

    const whereClause =
      wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";

    const sql = `
      SELECT
        c.commander_id,
        cmd.name AS commander_name,
        cmd.slug AS commander_slug,
        c.combo_id,
        c.card_names,
        c.card_ids,
        c.colors,
        c.results,
        c.deck_count,
        c.percentage,
        c.bracket_score
      ${fromClause}
      ${whereClause}
      ORDER BY c.deck_count DESC
      LIMIT ?
    `;
    binds.push(limit);

    const result = await env.DB.prepare(sql)
      .bind(...binds)
      .all<ComboRow>();

    const combos = (result.results ?? []).map((row) => ({
      commander_id: row.commander_id,
      commander_name: row.commander_name,
      commander_slug: row.commander_slug,
      combo_id: row.combo_id,
      card_names: safeParseJSON<string[]>(row.card_names, []),
      card_ids: safeParseJSON<string[]>(row.card_ids, []),
      colors: row.colors,
      results: safeParseJSON<string[]>(row.results, []),
      deck_count: row.deck_count,
      percentage: row.percentage,
      bracket_score: row.bracket_score,
    }));

    return {
      type: "structured",
      data: {
        combos,
        count: combos.length,
        attribution: {
          source: "EDHREC",
          note: "Combos are sourced from EDHREC's combo database, which in turn draws from Commander Spellbook. Bracket score is the Commander rules committee's 1-4 power level indicator.",
        },
      },
    };
  },
};

