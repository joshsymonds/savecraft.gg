/**
 * WoW dungeon_guide — native reference module.
 *
 * FTS5 search over dungeon/raid boss encounters stored in D1. Each result
 * includes the encounter's abilities so the AI never fabricates boss mechanics.
 *
 * Query modes:
 *   name         — FTS5 full-text search on encounter/instance name
 *   encounter_id — direct lookup by Blizzard encounter ID
 *   instance     — filter results to a specific dungeon/raid
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";

const DEFAULT_LIMIT = 10;

interface EncounterRow {
  encounter_id: number;
  encounter_name: string;
  instance_id: number | null;
  instance_name: string | null;
}

interface AbilityRow {
  ability_name: string;
  ability_description: string | null;
}

function fts5Safe(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

async function fetchAbilities(
  db: D1Database,
  encounterIds: number[],
): Promise<Map<number, AbilityRow[]>> {
  if (encounterIds.length === 0) return new Map();

  const placeholders = encounterIds.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT encounter_id, ability_name, ability_description
       FROM wow_encounter_abilities
       WHERE encounter_id IN (${placeholders})
       ORDER BY encounter_id, id`,
    )
    .bind(...encounterIds)
    .all<{ encounter_id: number; ability_name: string; ability_description: string | null }>();

  const map = new Map<number, AbilityRow[]>();
  for (const row of rows.results) {
    const list = map.get(row.encounter_id) ?? [];
    list.push({
      ability_name: row.ability_name,
      ability_description: row.ability_description,
    });
    map.set(row.encounter_id, list);
  }
  return map;
}

function encounterToResult(
  row: EncounterRow,
  abilities: AbilityRow[],
): Record<string, unknown> {
  return {
    encounter_id: row.encounter_id,
    encounter_name: row.encounter_name,
    instance_id: row.instance_id,
    instance_name: row.instance_name,
    abilities,
  };
}

export const dungeonGuideModule: NativeReferenceModule = {
  id: "dungeon_guide",
  name: "Dungeon Guide",
  description: [
    "Search WoW dungeon and raid boss encounters by name, with boss abilities.",
    "USE PROACTIVELY: query this module before describing boss mechanics, dungeon strategies, or encounter abilities to ensure accuracy.",
  ].join(" "),
  parameters: {
    name: {
      type: "string",
      description:
        "Search encounters by name (full-text search). Matches encounter names and instance names.",
    },
    encounter_id: {
      type: "number",
      description: "Look up a specific encounter by its Blizzard encounter ID.",
    },
    instance: {
      type: "string",
      description:
        "Filter results to a specific dungeon or raid. Example: 'Windrunner Spire'",
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
    const encounterId =
      typeof query.encounter_id === "number" ? query.encounter_id : undefined;
    const instance =
      typeof query.instance === "string" ? query.instance.trim() : undefined;
    const limit =
      typeof query.limit === "number"
        ? Math.min(Math.max(query.limit, 1), 50)
        : DEFAULT_LIMIT;

    // Direct encounter_id lookup
    if (encounterId !== undefined) {
      const rows = await db
        .prepare("SELECT * FROM wow_encounters WHERE encounter_id = ?")
        .bind(encounterId)
        .all<EncounterRow>();

      const abilityMap = await fetchAbilities(
        db,
        rows.results.map((r) => r.encounter_id),
      );

      return {
        type: "structured",
        data: {
          query: { encounter_id: encounterId },
          encounters: rows.results.map((r) =>
            encounterToResult(r, abilityMap.get(r.encounter_id) ?? []),
          ),
          count: rows.results.length,
        },
      };
    }

    // FTS5 name search (subquery pattern — no cartesian products)
    if (name) {
      const safeName = fts5Safe(name);
      const conditions: string[] = [
        "e.encounter_id IN (SELECT encounter_id FROM wow_encounters_fts WHERE wow_encounters_fts MATCH ?)",
      ];
      const bindings: unknown[] = [safeName];

      if (instance) {
        conditions.push("e.instance_name = ?");
        bindings.push(instance);
      }

      const sql = `SELECT e.* FROM wow_encounters e WHERE ${conditions.join(" AND ")} ORDER BY e.instance_name, e.encounter_name LIMIT ?`;
      bindings.push(limit);

      const rows = await db
        .prepare(sql)
        .bind(...bindings)
        .all<EncounterRow>();

      const abilityMap = await fetchAbilities(
        db,
        rows.results.map((r) => r.encounter_id),
      );

      return {
        type: "structured",
        data: {
          query: { name, instance },
          encounters: rows.results.map((r) =>
            encounterToResult(r, abilityMap.get(r.encounter_id) ?? []),
          ),
          count: rows.results.length,
        },
      };
    }

    return {
      type: "text",
      content:
        "Provide at least one query parameter: name (text search) or encounter_id (direct lookup). Optional filter: instance.",
    };
  },
};
