/**
 * WoW ability_lookup — native reference module.
 *
 * FTS5 search over WoW spells/abilities stored in D1. Every result includes
 * class and spec assignments so the AI never says the wrong ability on the
 * wrong class.
 *
 * Query modes:
 *   name     — FTS5 full-text search on spell name/description
 *   spell_id — direct lookup by Blizzard spell ID
 *   class    — filter results to a specific class
 *   spec     — filter results to a specific spec
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";

const DEFAULT_LIMIT = 20;

interface SpellRow {
  spell_id: number;
  name: string;
  description: string | null;
  icon: string | null;
  class_id: number | null;
  class_name: string | null;
  spec_id: number | null;
  spec_name: string | null;
  source: string;
}

function spellRowToResult(row: SpellRow): Record<string, unknown> {
  return {
    spell_id: row.spell_id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    class_id: row.class_id,
    class_name: row.class_name,
    spec_id: row.spec_id,
    spec_name: row.spec_name,
    source: row.source,
  };
}

/** Sanitize a string for FTS5 MATCH: wrap in double quotes, escape internal double quotes. */
function fts5Safe(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

export const abilityLookupModule: NativeReferenceModule = {
  id: "ability_lookup",
  name: "Ability Lookup",
  description: [
    "Search WoW spells and abilities by name with class/spec filtering.",
    "USE PROACTIVELY: query this module to verify ability names, check which class/spec an ability belongs to, or look up spell descriptions before referencing them in advice.",
    "Every result includes class_name and spec_name so you can confirm an ability belongs to the player's spec.",
  ].join(" "),
  parameters: {
    name: {
      type: "string",
      description:
        "Search spells by name (full-text search). Example: 'Shield of the Righteous'",
    },
    spell_id: {
      type: "number",
      description: "Look up a specific spell by its Blizzard spell ID.",
    },
    class: {
      type: "string",
      description:
        "Filter results to a specific class. Example: 'Paladin', 'Death Knight'",
    },
    spec: {
      type: "string",
      description:
        "Filter results to a specific specialization. Example: 'Protection', 'Holy'",
    },
    limit: {
      type: "number",
      description: `Maximum results to return (default ${DEFAULT_LIMIT}).`,
    },
  },

  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const db = env.DB;
    const name = typeof query.name === "string" ? query.name.trim() : undefined;
    const spellId =
      typeof query.spell_id === "number" ? query.spell_id : undefined;
    const className =
      typeof query.class === "string" ? query.class.trim() : undefined;
    const specName =
      typeof query.spec === "string" ? query.spec.trim() : undefined;
    const limit =
      typeof query.limit === "number"
        ? Math.min(Math.max(query.limit, 1), 100)
        : DEFAULT_LIMIT;

    // Direct spell_id lookup
    if (spellId !== undefined) {
      const rows = await db
        .prepare("SELECT * FROM wow_spells WHERE spell_id = ?")
        .bind(spellId)
        .all<SpellRow>();

      return {
        type: "structured",
        data: {
          query: { spell_id: spellId },
          spells: rows.results.map(spellRowToResult),
          count: rows.results.length,
        },
      };
    }

    // FTS5 name search
    if (name) {
      // Build FTS5 query, then join back to main table for full data + optional filters
      const safeName = fts5Safe(name);
      const conditions: string[] = [];
      const bindings: unknown[] = [];

      // Base: FTS5 match on name column
      let sql = `
        SELECT s.* FROM wow_spells s
        INNER JOIN wow_spells_fts fts ON s.spell_id = fts.spell_id
        WHERE wow_spells_fts MATCH ?
      `;
      bindings.push(safeName);

      if (className) {
        conditions.push("s.class_name = ?");
        bindings.push(className);
      }
      if (specName) {
        conditions.push("s.spec_name = ?");
        bindings.push(specName);
      }

      if (conditions.length > 0) {
        sql += ` AND ${conditions.join(" AND ")}`;
      }

      sql += ` ORDER BY rank LIMIT ?`;
      bindings.push(limit);

      const rows = await db
        .prepare(sql)
        .bind(...bindings)
        .all<SpellRow>();

      return {
        type: "structured",
        data: {
          query: { name, class: className, spec: specName },
          spells: rows.results.map(spellRowToResult),
          count: rows.results.length,
        },
      };
    }

    // No valid query params
    return {
      type: "text",
      content:
        "Provide at least one query parameter: name (text search) or spell_id (direct lookup). Optional filters: class, spec.",
    };
  },
};
