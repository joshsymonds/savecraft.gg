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
const EFFECTIVE_DATE = "November 14, 2025";
const RULES_HEADER = `MTG Comprehensive Rules (effective ${EFFECTIVE_DATE})`;
const MAX_SEE_ALSO_REFS = 20;

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

  // Exact match + prefix match (702.2 -> 702.2, 702.2a, 702.2b...)
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

  return { type: "formatted", content: lines.join("\n") + "\n" };
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

  // Suggest card ruling lookup if the rule is about a keyword
  const keywords = /\b(deathtouch|trample|flying|first strike|double strike|lifelink|vigilance|haste|reach|menace|hexproof|indestructible|ward|flash)\b/i;
  for (const r of rules) {
    const match = keywords.exec(r.text);
    if (match) {
      suggestions.push(
        `To see how ${match[1]} works on specific cards, search by card name with the "card" parameter`,
      );
      break;
    }
  }

  if (suggestions.length === 0) return "";
  return "\n---\nSuggested follow-ups:\n" + suggestions.map((s) => `- ${s}`).join("\n");
}

async function searchByKeywordOrTopic(
  db: D1Database,
  ai: Ai | undefined,
  vectorIndex: VectorizeIndex | undefined,
  queryText: string,
  label: string,
  limit: number,
): Promise<ReferenceResult> {
  // Build FTS5 MATCH expression from query text.
  // Split into individual terms, quote each for injection safety.
  // keyword mode: OR (find rules about any term, ranked by relevance)
  // topic mode: AND (find rules containing all terms)
  const connector = label === "keyword" ? " OR " : " AND ";
  const terms = queryText.trim().split(/\s+/).filter(Boolean);
  const safeQuery = terms.length > 0
    ? terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(connector)
    : `"${queryText.replace(/"/g, '""')}"`;

  // BM25 search via FTS5
  const bm25Results = await db
    .prepare(
      `SELECT number FROM mtga_rules_fts WHERE mtga_rules_fts MATCH ?1 ORDER BY rank LIMIT ?2`,
    )
    .bind(safeQuery, limit * 2) // fetch extra for RRF merge
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
    } catch (error) {
      console.warn("Vectorize query failed, falling back to BM25-only:", error);
    }
  }

  // Merge results via RRF
  const mergedIds = mergeWithRRF(bm25Ids, vectorIds, RRF_K);
  const topIds = mergedIds.slice(0, limit);

  if (topIds.length === 0) {
    return {
      type: "formatted",
      content: `No rules found matching ${label} "${queryText}". Try a different keyword, or use the "rule" parameter with a specific rule number.\n`,
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
  lines.push(`${orderedRules.length} rules matching ${label} "${queryText}" (${searchMethod} search, ${totalMatches > orderedRules.length ? `showing top ${orderedRules.length} of ~${totalMatches}` : `${orderedRules.length} total`})\n`);
  for (const r of orderedRules) {
    lines.push(`${r.number} ${r.text}`);
  }

  // Add guidance
  lines.push("\n---");
  lines.push("These rules are ranked by relevance. To get the full text of a specific rule including examples and cross-references, query by rule number (e.g., rule=\"702.2\").");
  lines.push("IMPORTANT: Always cite specific rule numbers when explaining interactions to the player. Do not paraphrase rules from memory — use the text above.");

  return { type: "formatted", content: lines.join("\n") + "\n" };
}

async function searchCardRulings(
  db: D1Database,
  cardName: string,
): Promise<ReferenceResult> {
  // Sanitize for FTS5 MATCH: wrap in double quotes, escape internal double quotes
  const safeFtsQuery = `"${cardName.replace(/"/g, '""')}"`;

  // Escape LIKE wildcards in card name
  const escapedName = cardName.replace(/[%_]/g, "\\$&");

  // Run FTS5 and LIKE queries in parallel — they are independent
  const [ftsResults, likeResults] = await Promise.all([
    db
      .prepare(
        `SELECT DISTINCT oracle_id, card_name FROM mtga_card_rulings_fts WHERE mtga_card_rulings_fts MATCH ?1 LIMIT ?2`,
      )
      .bind(safeFtsQuery, 5)
      .all<{ oracle_id: string; card_name: string }>(),
    db
      .prepare(
        `SELECT DISTINCT oracle_id, card_name FROM mtga_card_rulings WHERE card_name LIKE ?1 ESCAPE '\\' LIMIT 5`,
      )
      .bind(`%${escapedName}%`)
      .all<{ oracle_id: string; card_name: string }>(),
  ]);

  // Merge unique oracle_ids
  const seen = new Map<string, string>();
  for (const r of [...ftsResults.results, ...likeResults.results]) {
    if (!seen.has(r.oracle_id)) {
      seen.set(r.oracle_id, r.card_name);
    }
  }

  if (seen.size === 0) {
    return { type: "formatted", content: `No card rulings found for "${cardName}". Try a partial name or check the card name spelling.\n` };
  }

  // Collect all oracle_ids to fetch rulings in a single query (avoid N+1)
  const oracleIds = [...seen.keys()].slice(0, 5);
  const placeholders = oracleIds.map(() => "?").join(",");
  const allRulings = await db
    .prepare(
      `SELECT oracle_id, published_at, comment FROM mtga_card_rulings WHERE oracle_id IN (${placeholders}) ORDER BY oracle_id, published_at DESC`,
    )
    .bind(...oracleIds)
    .all<{ oracle_id: string; published_at: string | null; comment: string }>();

  // Group rulings by oracle_id
  const rulingsByOracle = new Map<string, Array<{ published_at: string | null; comment: string }>>();
  for (const r of allRulings.results) {
    let list = rulingsByOracle.get(r.oracle_id);
    if (!list) {
      list = [];
      rulingsByOracle.set(r.oracle_id, list);
    }
    list.push({ published_at: r.published_at, comment: r.comment });
  }

  const lines: string[] = [];
  lines.push("Official Scryfall Rulings (Wizards of the Coast)\n");
  let count = 0;
  let latestDate = "";

  for (const [oracleId, name] of seen) {
    if (count >= 5) {
      lines.push(`(${seen.size - 5} more cards match, narrow your search)`);
      break;
    }

    const rulings = rulingsByOracle.get(oracleId) ?? [];

    if (rulings.length > 0) {
      lines.push(`${name} (${rulings.length} rulings):\n`);
      for (const r of rulings) {
        const date = r.published_at ?? "unknown";
        lines.push(`  [${date}] ${r.comment}`);
        if (date > latestDate) latestDate = date;
      }
      lines.push("");
    }
    count++;
  }

  if (lines.length <= 1) {
    return {
      type: "formatted",
      content: `No rulings found for "${cardName}" (card exists but has no official rulings). Check the Comprehensive Rules for the underlying mechanics instead — use the "keyword" or "topic" parameter.\n`,
    };
  }

  // Guidance footer
  lines.push("---");
  if (latestDate) {
    lines.push(`Most recent ruling: ${latestDate}`);
  }
  lines.push("These are official WotC rulings via Scryfall. For the underlying game mechanics (e.g., how deathtouch or trample work in general), query by keyword or rule number.");
  lines.push("IMPORTANT: Card-specific rulings override general rules. Always check both when analyzing an interaction.");

  return { type: "formatted", content: lines.join("\n") + "\n" };
}

// ── Module definition ────────────────────────────────────────

export const rulesSearchModule: NativeReferenceModule = {
  id: "rules_search",
  name: "Rules Search",
  description: [
    "Search the MTG Comprehensive Rules and official per-card rulings from Scryfall.",
    "USE PROACTIVELY: query this module BEFORE making any claim about how a card interaction works, what happens during a game phase, how triggered abilities resolve, or any rules interpretation.",
    "Do not rely on training data for MTG rules — the Comprehensive Rules are updated with every set release and card-specific rulings are issued continuously. Verify against this authoritative source.",
    "Especially critical for: card interactions between specific cards, triggered vs replacement effects, state-based actions, combat damage assignment with keywords like trample+deathtouch, stack and priority, layer system, and any ruling a player might dispute.",
    "Query by rule number for specific lookups with full cross-references, by keyword or topic for ranked search across all rules, or by card name for official Scryfall rulings on specific cards.",
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
        "Keyword search ranked by relevance (e.g., 'deathtouch', 'trample'). Use when looking for rules about a specific game mechanic or term.",
    },
    topic: {
      type: "string",
      description:
        "Natural language topic search (e.g., 'what happens when two replacement effects apply', 'combat damage assignment order'). Use for questions about game situations or phase rules.",
    },
    card: {
      type: "string",
      description:
        "Card name for official Scryfall rulings (e.g., 'Sheoldred'). Returns card-specific rulings from Wizards of the Coast. Use alongside keyword/rule searches for complete interaction analysis.",
    },
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
