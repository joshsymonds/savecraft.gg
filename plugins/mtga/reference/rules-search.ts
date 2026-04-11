/**
 * MTG Arena rules_search — native reference module.
 *
 * Hybrid search: D1 FTS5 (BM25 keyword ranking) + Vectorize (semantic similarity),
 * merged via Reciprocal Rank Fusion. Falls back to FTS5-only when Vectorize is
 * unavailable.
 *
 * Two query modes:
 *   rule    — exact D1 lookup + cross-reference expansion
 *   keyword — hybrid FTS5 + Vectorize search
 */

import type { Env } from "../../../worker/src/types";
import type { NativeReferenceModule, ReferenceResult } from "../../../worker/src/reference/types";

const DEFAULT_LIMIT = 20;
const RRF_K = 60;
const EFFECTIVE_DATE = "November 14, 2025";
const RULES_HEADER = `MTG Comprehensive Rules (effective ${EFFECTIVE_DATE})`;
const MAX_SEE_ALSO_REFS = 20;

interface RuleRow {
  number: string;
  text: string;
  example: string | null;
  see_also: string | null;
}

import { mergeWithRRF } from "../../../worker/src/reference/rrf";

// ── Shared helpers ───────────────────────────────────���──────

/** FTS5-only keyword search — returns ranked rule rows without Vectorize. */
async function searchRulesByFts(
  db: D1Database,
  queryText: string,
  limit: number,
): Promise<RuleRow[]> {
  const terms = queryText.trim().split(/\s+/).filter((t) => t.length >= 3);
  if (terms.length === 0) return [];

  const safeQuery = terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ");

  const ftsResults = await db
    .prepare(
      `SELECT number FROM mtga_rules_fts WHERE mtga_rules_fts MATCH ?1 ORDER BY rank LIMIT ?2`,
    )
    .bind(safeQuery, limit)
    .all<{ number: string }>();

  if (ftsResults.results.length === 0) return [];

  const ids = ftsResults.results.map((r) => r.number);
  const placeholders = ids.map(() => "?").join(",");
  const ruleRows = await db
    .prepare(`SELECT * FROM mtga_rules WHERE number IN (${placeholders})`)
    .bind(...ids)
    .all<RuleRow>();

  // Preserve FTS5 rank order
  const ruleMap = new Map(ruleRows.results.map((r) => [r.number, r]));
  return ids.map((id) => ruleMap.get(id)).filter((r): r is RuleRow => r != null);
}

// ── Query handlers ───────────────────────────────────────────

async function searchByRuleNumber(db: D1Database, ruleNum: string): Promise<ReferenceResult> {
  const trimmed = ruleNum.trim();

  // Exact match + prefix match (702.2 -> 702.2, 702.2a, 702.2b...)
  const rows = await db
    .prepare(
      `SELECT * FROM mtga_rules WHERE number = ?1 OR (number LIKE ?2 AND length(number) = length(?1) + 1)`,
    )
    .bind(trimmed, `${trimmed}%`)
    .all<RuleRow>();

  if (rows.results.length === 0) {
    return { type: "text", content: `No rule found matching "${trimmed}"\n` };
  }

  const lines: string[] = [];
  lines.push(`${RULES_HEADER}\n`);
  lines.push(`Rule ${trimmed} (${rows.results.length} matching rules)\n`);

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

  // Cap seeAlsoRefs to prevent oversized cross-reference queries
  const cappedRefs = [...seeAlsoRefs].slice(0, MAX_SEE_ALSO_REFS);

  if (cappedRefs.length > 0) {
    const placeholders = cappedRefs.map(() => "?").join(",");
    const refRows = await db
      .prepare(`SELECT number, text FROM mtga_rules WHERE number IN (${placeholders})`)
      .bind(...cappedRefs)
      .all<RuleRow>();

    if (refRows.results.length > 0) {
      lines.push("\nCross-referenced rules (auto-expanded from see-also references):");
      for (const r of refRows.results) {
        lines.push(`${r.number} ${r.text}`);
      }
    }
  }

  // Suggested follow-ups based on content
  lines.push(buildFollowUpSuggestions(rows.results, seeAlsoRefs));

  return {
    type: "text",
    content: lines.join("\n") + "\n",
  };
}

/** Build suggested follow-up queries based on rule content. */
function buildFollowUpSuggestions(rules: RuleRow[], expandedRefs: Set<string>): string {
  const suggestions: string[] = [];

  // Collect rule numbers mentioned in text but not already shown
  const shownNumbers = new Set(rules.map((r) => r.number));
  for (const num of expandedRefs) {
    shownNumbers.add(num);
  }

  const mentionedRules = new Set<string>();
  for (const r of rules) {
    const combined = `${r.text} ${r.example ?? ""}`;
    // Match rule number patterns like 704.5g, 603.7a, 120.4
    for (const match of combined.matchAll(/\brules? (\d{3}(?:\.\d+[a-z]?))\b/g)) {
      const ref = match[1]!;
      if (!shownNumbers.has(ref) && !mentionedRules.has(ref)) {
        mentionedRules.add(ref);
      }
    }
  }

  if (mentionedRules.size > 0) {
    const topRefs = [...mentionedRules].slice(0, 5);
    suggestions.push(`Look up related rules: ${topRefs.map((r) => `rule ${r}`).join(", ")}`);
  }

  if (suggestions.length === 0) return "";
  return "\n---\nSuggested follow-ups:\n" + suggestions.map((s) => `- ${s}`).join("\n");
}

async function searchByKeyword(
  db: D1Database,
  ai: Ai | undefined,
  vectorIndex: VectorizeIndex | undefined,
  queryText: string,
  limit: number,
): Promise<ReferenceResult> {
  // BM25 search via shared FTS5 helper (fetch extra for RRF merge)
  const bm25Rules = await searchRulesByFts(db, queryText, limit * 2);
  const bm25Ids = bm25Rules.map((r) => r.number);

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
    } catch (error) {
      console.warn("Vectorize query failed, falling back to BM25-only:", error);
    }
  }

  // Merge results via RRF
  const topIds = mergeWithRRF(bm25Ids, vectorIds, RRF_K, limit);

  if (topIds.length === 0) {
    return {
      type: "text",
      content: `No rules found matching keyword "${queryText}". Try a different keyword, or use the "rule" parameter with a specific rule number.\n`,
    };
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

  const totalMatches = bm25Ids.length + vectorIds.length - topIds.length; // approximate unique total
  const searchMethod = vectorIds.length > 0 ? "hybrid (keyword + semantic)" : "keyword";

  const lines: string[] = [];
  lines.push(`${RULES_HEADER}\n`);
  lines.push(`${orderedRules.length} rules matching keyword "${queryText}" (${searchMethod} search, ${totalMatches > orderedRules.length ? `showing top ${orderedRules.length} of ~${totalMatches}` : `${orderedRules.length} total`})\n`);
  for (const r of orderedRules) {
    lines.push(`${r.number} ${r.text}`);
  }

  // Add guidance
  lines.push("\n---");
  lines.push("These rules are ranked by relevance. To get the full text of a specific rule including examples and cross-references, query by rule number (e.g., rule=\"702.2\").");
  lines.push("IMPORTANT: Always cite specific rule numbers when explaining interactions to the player. Do not paraphrase rules from memory — use the text above.");

  return {
    type: "text",
    content: lines.join("\n") + "\n",
  };
}

// ── Module definition ────────────────────────────────────────

export const rulesSearchModule: NativeReferenceModule = {
  id: "rules_search",
  name: "Rules Search",
  description: [
    "Search the MTG Comprehensive Rules — the authoritative, complete rules of Magic: The Gathering, updated every set release.",
    "USE PROACTIVELY: query this module BEFORE making any claim about how a card interaction works, what happens during a game phase, how triggered abilities resolve, or any rules interpretation.",
    "Do not rely on training data for MTG rules — the Comprehensive Rules change with every set release. Your training data may contain outdated rules, obsolete card rulings, or incorrect interaction analyses. Verify against this authoritative source.",
    "Especially critical for: card interactions between specific cards, triggered vs replacement effects, state-based actions, combat damage assignment with keywords like trample+deathtouch, stack and priority, layer system, and any ruling a player might dispute.",
    "Query by rule number for specific lookups with full cross-references, or by keyword for ranked search across all rules.",
    "When explaining an interaction, cite the specific rule numbers from the results. If the answer involves multiple rules, make multiple queries to build a complete picture.",
  ].join(" "),
  parameters: {
    rule: {
      type: "string",
      description:
        "Rule number (e.g., '702.2' for deathtouch). Returns the rule + all subrules + examples + cross-referenced rules. Use this when you know or have found the specific rule number.",
    },
    keyword: {
      type: "string",
      description:
        "Keyword search ranked by relevance (e.g., 'deathtouch', 'trample', 'Saga'). Multi-word queries match rules containing ANY term (OR). For complex interactions involving multiple mechanics (e.g., trample + deathtouch), query each keyword separately and synthesize the results — this finds the specific rules for each mechanic rather than only rules that happen to mention both. Also works for card-specific mechanics — search for the card's types or keywords (e.g., 'Saga' for Urza's Saga rules).",
    },
    limit: { type: "integer", description: "Max results (default 20)." },
  },

  async execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult> {
    const rule = (query.rule as string) ?? "";
    const keyword = (query.keyword as string) ?? "";
    const limit = typeof query.limit === "number" ? query.limit : DEFAULT_LIMIT;

    if (rule) {
      return searchByRuleNumber(env.DB, rule);
    }
    if (keyword) {
      return searchByKeyword(env.DB, env.AI, env.MTGA_RULES_INDEX, keyword, limit);
    }

    return { type: "text", content: "Specify one of: rule (number) or keyword.\n" };
  },
};
