/**
 * MTG Arena rules_search — native reference module.
 *
 * Hybrid search: D1 FTS5 (BM25 keyword ranking) + Vectorize (semantic similarity),
 * merged via Reciprocal Rank Fusion. Falls back to FTS5-only when Vectorize is
 * unavailable.
 *
 * Four query modes:
 *   rule    — exact D1 lookup + cross-reference expansion
 *   keyword — hybrid FTS5 + Vectorize search
 *   topic   — hybrid FTS5 + Vectorize search
 *   card    — card ruling lookup by name
 */

import type { Env } from "../../../worker/src/types";
import type { NativeReferenceModule, ReferenceResult } from "../../../worker/src/reference/types";

const DEFAULT_LIMIT = 20;
const RRF_K = 60;

interface RuleRow {
  number: string;
  text: string;
  example: string | null;
  see_also: string | null;
}

/** Reciprocal Rank Fusion: merge two ranked ID lists into one. */
export function mergeWithRRF(bm25Ids: string[], vectorIds: string[], k: number): string[] {
  const scores = new Map<string, number>();

  for (let i = 0; i < bm25Ids.length; i++) {
    const id = bm25Ids[i]!;
    scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i));
  }
  for (let i = 0; i < vectorIds.length; i++) {
    const id = vectorIds[i]!;
    scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i));
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

// ── Query handlers ───────────────────────────────────────────

async function searchByRuleNumber(db: D1Database, ruleNum: string): Promise<ReferenceResult> {
  const trimmed = ruleNum.trim();

  // Exact match + prefix match (702.2 → 702.2, 702.2a, 702.2b...)
  const rows = await db
    .prepare(
      `SELECT * FROM mtga_rules WHERE number = ?1 OR (number LIKE ?2 AND length(number) = length(?1) + 1)`,
    )
    .bind(trimmed, `${trimmed}%`)
    .all<RuleRow>();

  if (rows.results.length === 0) {
    return { type: "formatted", content: `No rule found matching "${trimmed}"\n` };
  }

  const lines: string[] = [];
  lines.push(`Rules matching ${trimmed}\n`);

  for (const r of rows.results) {
    lines.push(`${r.number} ${r.text}`);
    if (r.example) {
      lines.push(`  ${r.example}`);
    }
  }

  // Cross-reference expansion (1 level)
  const matchedNumbers = new Set(rows.results.map((r) => r.number));
  const seeAlsoRefs = new Set<string>();
  for (const r of rows.results) {
    if (r.see_also) {
      try {
        const refs = JSON.parse(r.see_also) as string[];
        for (const ref of refs) {
          if (!matchedNumbers.has(ref)) {
            seeAlsoRefs.add(ref);
          }
        }
      } catch {
        // Malformed see_also, skip
      }
    }
  }

  if (seeAlsoRefs.size > 0) {
    const placeholders = [...seeAlsoRefs].map(() => "?").join(",");
    const refRows = await db
      .prepare(`SELECT number, text FROM mtga_rules WHERE number IN (${placeholders})`)
      .bind(...seeAlsoRefs)
      .all<RuleRow>();

    if (refRows.results.length > 0) {
      lines.push("\nCross-referenced rules:");
      for (const r of refRows.results) {
        lines.push(`${r.number} ${r.text}`);
      }
    }
  }

  return { type: "formatted", content: lines.join("\n") + "\n" };
}

async function searchByKeywordOrTopic(
  db: D1Database,
  ai: Ai | undefined,
  vectorIndex: VectorizeIndex | undefined,
  queryText: string,
  label: string,
  limit: number,
): Promise<ReferenceResult> {
  // BM25 search via FTS5
  const bm25Results = await db
    .prepare(
      `SELECT number FROM mtga_rules_fts WHERE mtga_rules_fts MATCH ?1 ORDER BY rank LIMIT ?2`,
    )
    .bind(queryText, limit * 2) // fetch extra for RRF merge
    .all<{ number: string }>();

  const bm25Ids = bm25Results.results.map((r) => r.number);

  // Vectorize semantic search (if available)
  let vectorIds: string[] = [];
  if (ai && vectorIndex) {
    try {
      const embedding = (await ai.run("@cf/baai/bge-base-en-v1.5", {
        text: [queryText],
      })) as { data?: number[][] };
      if (embedding.data?.[0]) {
        const vectorResults = await vectorIndex.query(embedding.data[0], {
          topK: limit * 2,
          filter: { type: "rule" },
        });
        vectorIds = vectorResults.matches.map((m) => m.id);
      }
    } catch {
      // Vectorize unavailable — fall back to BM25 only
    }
  }

  // Merge results via RRF
  const mergedIds = mergeWithRRF(bm25Ids, vectorIds, RRF_K);
  const topIds = mergedIds.slice(0, limit);

  if (topIds.length === 0) {
    return { type: "formatted", content: `No rules found matching ${label} "${queryText}"\n` };
  }

  // Fetch full rule text for merged results
  const placeholders = topIds.map(() => "?").join(",");
  const ruleRows = await db
    .prepare(`SELECT * FROM mtga_rules WHERE number IN (${placeholders})`)
    .bind(...topIds)
    .all<RuleRow>();

  // Re-sort by RRF rank order
  const ruleMap = new Map(ruleRows.results.map((r) => [r.number, r]));
  const orderedRules = topIds.map((id) => ruleMap.get(id)).filter((r): r is RuleRow => r != null);

  const lines: string[] = [];
  lines.push(`Rules matching ${label} "${queryText}" (${orderedRules.length} results)\n`);
  for (const r of orderedRules) {
    lines.push(`${r.number} ${r.text}`);
  }

  return { type: "formatted", content: lines.join("\n") + "\n" };
}

async function searchCardRulings(
  db: D1Database,
  cardName: string,
): Promise<ReferenceResult> {
  // FTS5 search to find matching card names
  const ftsResults = await db
    .prepare(
      `SELECT DISTINCT oracle_id, card_name FROM mtga_card_rulings_fts WHERE mtga_card_rulings_fts MATCH ?1 LIMIT ?2`,
    )
    .bind(cardName, 5) // max 5 distinct cards
    .all<{ oracle_id: string; card_name: string }>();

  // Also try substring match on structured table for exact card name parts
  const likeResults = await db
    .prepare(
      `SELECT DISTINCT oracle_id, card_name FROM mtga_card_rulings WHERE card_name LIKE ?1 LIMIT 5`,
    )
    .bind(`%${cardName}%`)
    .all<{ oracle_id: string; card_name: string }>();

  // Merge unique oracle_ids
  const seen = new Map<string, string>();
  for (const r of [...ftsResults.results, ...likeResults.results]) {
    if (!seen.has(r.oracle_id)) {
      seen.set(r.oracle_id, r.card_name);
    }
  }

  if (seen.size === 0) {
    return { type: "formatted", content: `No card rulings found for "${cardName}"\n` };
  }

  const lines: string[] = [];
  let count = 0;

  for (const [oracleId, name] of seen) {
    if (count >= 5) {
      lines.push(`(${seen.size - 5} more cards match, narrow your search)`);
      break;
    }

    const rulings = await db
      .prepare(
        "SELECT published_at, comment FROM mtga_card_rulings WHERE oracle_id = ? ORDER BY published_at DESC",
      )
      .bind(oracleId)
      .all<{ published_at: string | null; comment: string }>();

    if (rulings.results.length > 0) {
      lines.push(`Official rulings for ${name}:\n`);
      for (const r of rulings.results) {
        lines.push(`  ${r.published_at ?? "unknown"}: ${r.comment}`);
      }
      lines.push("");
    }
    count++;
  }

  if (lines.length === 0) {
    return {
      type: "formatted",
      content: `No rulings found for "${cardName}" (card exists but has no official rulings)\n`,
    };
  }

  return { type: "formatted", content: lines.join("\n") };
}

// ── Module definition ────────────────────────────────────────

export const rulesSearchModule: NativeReferenceModule = {
  id: "rules_search",
  name: "Rules Search",
  description:
    "Search MTG Comprehensive Rules and official card rulings. Query by rule number, keyword, topic, or card name.",
  parameters: {
    rule: { type: "string", description: "Rule number (e.g., '702.2' for deathtouch)." },
    keyword: { type: "string", description: "Keyword search across all rules." },
    topic: { type: "string", description: "Multi-word topic search." },
    card: { type: "string", description: "Card name for official Scryfall rulings." },
    limit: { type: "integer", description: "Max results (default 20)." },
  },

  async execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult> {
    const rule = (query.rule as string) ?? "";
    const keyword = (query.keyword as string) ?? "";
    const topic = (query.topic as string) ?? "";
    const card = (query.card as string) ?? "";
    const limit = typeof query.limit === "number" ? query.limit : DEFAULT_LIMIT;

    if (rule) {
      return searchByRuleNumber(env.DB, rule);
    }
    if (card) {
      return searchCardRulings(env.DB, card);
    }
    if (keyword) {
      return searchByKeywordOrTopic(env.DB, env.AI, env.MTGA_RULES_INDEX, keyword, "keyword", limit);
    }
    if (topic) {
      return searchByKeywordOrTopic(env.DB, env.AI, env.MTGA_RULES_INDEX, topic, "topic", limit);
    }

    return { type: "formatted", content: "Specify one of: rule (number), keyword, topic, or card.\n" };
  },
};
