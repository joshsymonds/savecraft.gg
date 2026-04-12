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

interface InteractionRow {
  id: number;
  title: string;
  mechanics: string;
  card_names: string;
  rule_numbers: string;
  breakdown: string;
  common_error: string;
}

import { mergeWithRRF } from "../../../worker/src/reference/rrf";

// ── Reasoning guide ─────────────────────────────────────────
// Appended to every rules_search response. Provides the LLM with a complete
// framework for reasoning about rules interactions — preventing synthesis
// errors even when the correct rules are retrieved.
const REASONING_GUIDE = `

═══ Rules Reasoning Guide ═══

Magic's Comprehensive Rules form a semi-formal logical system where card text functions as local overrides to global defaults, conflicts resolve through deterministic algorithms, and game state is derived by recomputing all continuous effects from scratch every time anything changes. Understanding this architecture — not memorizing rulings — is what enables correct synthesis of interactions from raw rules text.

THREE STRUCTURAL CAUSES OF REASONING ERRORS

Before applying any rule, internalize why errors happen:

1. INTUITION DEFEATS LITERALISM. MTG rules are extremely literal and precise. "Tap to attack, therefore tap to block" is logical but wrong. "The last effect played wins" is intuitive but ignores the layer system. "You can always respond" feels right but misses non-stack actions. ALWAYS force literal reading and keyword classification before intuitive interpretation.

2. ORDERING SYSTEMS ARE INVISIBLE. The layer system, replacement effect ordering, SBA timing, and APNAP ordering exist only in the Comprehensive Rules, not on card text. An AI reasoning only from card text will miss them entirely. Whenever multiple effects interact, identify and apply the relevant ordering system.

3. NEGATION AND ABSENCE CREATE TRAPS. Replacement effects cause events to NEVER HAPPEN — triggers watching for those events don't fire. Indestructible prevents destruction but NOT sacrifice, exile, or -X/-X. Protection prevents exactly four things (DEBT: Damage, Enchanting/Equipping, Blocking, Targeting) and NOTHING else. "Can't" always beats "can." You must prove negatives explicitly, not match patterns.

THE GOLDEN RULES (CR 101) — AXIOM HIERARCHY

CR 101.1: Card text overrides general rules. The CR defines default behavior; cards create exceptions. When a card says something that contradicts a rule, the card wins. The sole exception is that a player can always concede (104.3a). Reasoning always starts by reading what the cards actually say, not what you assume the rules dictate.

CR 101.2: When one effect permits something and another prohibits it, "can't" always beats "can." This is a hard, deterministic tiebreaker that applies universally. Importantly, 101.2a carves out an exception: adding and removing abilities are not "can"/"can't" conflicts — they resolve through the layer system instead, via timestamp ordering.

CR 101.3: Impossible instructions are simply ignored. This prevents the system from halting on undefined states. Combined, these three rules create a precedence chain: card text > specific rules > general rules, with "can't" trumping "can" at every level, and impossibility silently skipped.

THE LAYER SYSTEM (CR 613) — DETERMINISTIC RECOMPUTATION

The layer system is not a one-time resolution — it is a continuous, automatic recomputation that the game performs constantly. Every time anything changes, the game recalculates all characteristics of all objects by starting from printed values and applying all continuous effects in a fixed sequence of seven layers: copy (1) → control (2) → text (3) → type (4) → color (5) → abilities (6) → power/toughness (7). Layer 7 contains four sublayers: CDAs (7a), then set-to-specific-value effects (7b), then modifications and counters (7c), then P/T switching (7d).

CRITICAL: Effects in earlier layers cannot "see" changes from later layers, but later layers see everything from earlier ones. When the game evaluates Layer 4 (type changes), it doesn't know what abilities Layer 6 will add or remove. When Layer 6 evaluates, it sees all type changes from Layer 4. This one-directional information flow is what makes the system deterministic rather than circular.

Within each layer, three ordering mechanisms apply in priority:
1. Characteristic-defining abilities always apply before other effects in layers 2–6 (per 613.3) and in sublayer 7a.
2. All remaining effects apply in timestamp order (613.7). Earlier timestamps apply first, so the most recent effect "wins" when two effects conflict in the same layer.
3. The dependency system (613.8) overrides timestamp when one effect's behavior depends on another. Effect A depends on Effect B if they're in the same layer and applying B would change what A does, what A applies to, or whether A exists. When a dependency exists, the depended-upon effect applies first regardless of timestamp. If dependencies form a loop, the system falls back to timestamp.

CR 613.6 (cross-layer lock-in): When a single effect spans multiple layers — like "all noncreature artifacts become 2/2 artifact creatures" — it locks in the set of affected objects when it first applies (Layer 4: type change) and continues applying to those same objects in later layers (Layer 7b: P/T setting), even if the generating ability is removed during this process.

REPLACEMENT EFFECTS (CR 614–616) — ITERATIVE PRIORITY ALGORITHM

Replacement effects are syntactically identified by the words "instead," "skip," "as [this] enters," or "[this] enters with." They modify events as they happen and never use the stack — they cannot be responded to. This is fundamentally different from triggered abilities ("when," "whenever," "at"), which go on the stack and can be countered or responded to.

When multiple replacement effects would modify the same event, CR 616.1 provides a strict priority algorithm. The affected player or controller must choose from applicable effects in this order: self-replacement effects first (614.15), then control-changing effects, then copy effects ("enter as a copy"), then back-face-up effects, then free choice among remaining effects. After each application, the system re-evaluates which replacement effects still apply to the now-modified event and repeats until none remain.

CRITICAL: The AFFECTED PLAYER or CONTROLLER OF THE AFFECTED OBJECT chooses the order — not the controller of the replacement effect sources. For damage dealt to a player, that player chooses.

For enters-the-battlefield replacement effects, CR 614.12 establishes a "lookahead" procedure: the game checks the permanent's characteristics as it would exist on the battlefield, taking into account replacement effects already applied, the permanent's own static abilities, and existing battlefield continuous effects.

STATE-BASED ACTIONS (CR 704) — INVARIANT CHECKS

State-based actions function like garbage collection — automatic invariant enforcement that runs whenever a player would receive priority. All applicable SBAs are found and performed simultaneously as a single event (704.3). The check then repeats until no more SBAs apply and no triggers are waiting.

CRITICAL (704.4): SBAs pay no attention to what happens during the resolution of a spell or ability. A creature whose toughness temporarily reaches 0 during a spell's resolution but recovers before the spell finishes resolving will survive.

SBAs are not replacement effects and not triggered abilities. They don't use the stack. They can't be responded to. Read their trigger conditions literally — a rule that says "a Saga with one or more chapter abilities" does NOT apply to a Saga with zero chapter abilities.

STACK vs. NON-STACK — THE MOST COMMON REASONING ERROR

Uses the stack: spells, activated abilities (non-mana), and triggered abilities.
Does NOT use the stack: mana abilities (605.3b), special actions (116.1 — including playing lands, morphing, foretelling), state-based actions (704), replacement effects (614), and turn-based actions (703).

"As [this] enters" = replacement effect (614.1c), a static ability that modifies the entry event itself. Doesn't use the stack. Choices are made before the permanent enters.
"When [this] enters" = triggered ability (603.6a) that goes on the stack after the permanent is already on the battlefield and can be responded to.

Costs (before the colon in activated abilities, or explicit "as an additional cost") are paid during step 601.2h as one atomic operation. No player receives priority during casting. By the time an opponent can respond, the spell is on the stack and all costs have been paid.

PROTECTION SCOPE — THE DEBT MNEMONIC

Protection prevents exactly four things: Damage, Enchanting/Equipping, Blocking, Targeting (DEBT). If an effect doesn't do one of these four things, protection is irrelevant. Board wipes (Wrath of God) don't target, so they ignore protection entirely. Sacrifice effects (Liliana's -2) don't target or deal damage, so protection is irrelevant. "Choose a creature" is not "target a creature," so hexproof and protection don't apply. Protection from Everything (Progenitus) still dies to non-targeting sacrifice and destroy effects. Indestructible prevents destruction and lethal damage but does NOT prevent: death from 0 or less toughness (via -X/-X or -1/-1 counters), sacrifice, exile, legend rule, or being countered. An indestructible creature IS a legal target for "destroy" effects — the spell resolves, fails to destroy, but any other effects on the spell still happen.

ABILITY ONTOLOGY — PRINTED vs. GRANTED

The distinction between printed abilities and granted abilities (113.12) is architecturally significant. An effect that says a creature "gains flying" grants an ability that can be removed by "loses flying." But an effect that says a creature "is red" sets a characteristic — not an ability. "Loses all abilities" won't undo it.

CR 305.7: When an effect sets a land's subtype to one or more basic land types, the land loses its old land types and all rules-text abilities, then gains intrinsic mana abilities for each new basic type. This is a Layer 4 type change. Abilities granted by external effects are unaffected. This is the canonical example of the printed-vs-granted distinction.

Copy effects (707.2) establish copiable values in Layer 1: they capture only printed text (name, mana cost, types, rules text, P/T) as modified by other copy effects, face-down status, and "as enters" P/T-setting abilities. Counters, granted abilities, and type-changing effects are NOT copied.

REASONING ALGORITHM — USE THIS PROCEDURE FOR EVERY INTERACTION

Step 1 — Read literally. Parse the card text and identify every operative word. "Instead" = replacement effect. "When/whenever/at" = triggered ability. "As [this] enters" = replacement effect. "[Cost]: [Effect]" = activated ability. A declarative statement with no trigger word = static ability.

Step 2 — Classify the interaction type. Is this about continuous effects overlapping (→ layer system)? Multiple replacement effects on one event (→ 616.1 algorithm)? Whether something uses the stack (→ stack/non-stack classification)? A game-state check (→ SBAs)?

Step 3 — Apply golden rules. Check for "can't" effects — they win over "can" effects (101.2). Check whether card text creates an exception to a general rule (101.1). Discard impossible instructions (101.3).

Step 4 — For continuous effects, trace through layers. Start from printed characteristics. Apply layers 1–7 in order with sublayers. Within each layer: CDAs first, then timestamp order, then check for dependencies. Effects in earlier layers are invisible to later layers. If a single effect spans layers, lock in the affected objects when first applied (613.6).

Step 5 — For replacement effects, iterate. Identify all applicable replacements. Apply self-replacements first (614.15). Then follow the 616.1 priority chain. After each application, re-evaluate which replacements still apply. The AFFECTED PLAYER/CONTROLLER chooses.

Step 6 — For stack interactions, verify what uses the stack. Only spells, activated abilities, and triggered abilities use the stack. Costs are paid during casting before anyone receives priority.

Step 7 — Verify against design intent. If the derived answer seems wrong, check whether a specific rule was missed. Common gaps: 613.6 (cross-layer lock-in), 614.12 (ETB replacement lookahead), 704.4 (SBAs ignore mid-resolution states), 113.12 (setting characteristics ≠ granting abilities), 101.2a (adding/removing abilities isn't a can/can't conflict).

Step 8 — State uncertainty explicitly. If the retrieved rules text doesn't fully determine the answer, say so. Edge cases exist where head-judge authority is the actual resolution mechanism.`;

// ── Interaction search ──────────────────────────────────────

const MAX_INTERACTIONS = 3;

/** Search interactions by FTS5 keyword match. */
async function searchInteractionsByKeyword(
  db: D1Database,
  queryText: string,
): Promise<InteractionRow[]> {
  const terms = queryText.trim().split(/\s+/).filter((t) => t.length >= 2);
  if (terms.length === 0) return [];

  const safeQuery = terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ");

  const ftsResults = await db
    .prepare(
      `SELECT id FROM mtga_interactions_fts WHERE mtga_interactions_fts MATCH ?1 ORDER BY rank LIMIT ?2`,
    )
    .bind(safeQuery, MAX_INTERACTIONS)
    .all<{ id: number }>();

  if (ftsResults.results.length === 0) return [];

  const ids = ftsResults.results.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db
    .prepare(`SELECT * FROM mtga_interactions WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<InteractionRow>();

  // Preserve FTS5 rank order
  const rowMap = new Map(rows.results.map((r) => [r.id, r]));
  return ids.map((id) => rowMap.get(id)).filter((r): r is InteractionRow => r != null);
}

/** Search interactions by rule number overlap. */
async function searchInteractionsByRuleNumber(
  db: D1Database,
  ruleNumbers: string[],
): Promise<InteractionRow[]> {
  if (ruleNumbers.length === 0) return [];

  const conditions = ruleNumbers.map(() => "rule_numbers LIKE ?").join(" OR ");
  const binds = ruleNumbers.map((r) => `%${r}%`);

  const rows = await db
    .prepare(`SELECT * FROM mtga_interactions WHERE ${conditions} LIMIT ?`)
    .bind(...binds, MAX_INTERACTIONS)
    .all<InteractionRow>();

  return rows.results;
}

/** Format interaction rows into a response section. */
function formatInteractions(interactions: InteractionRow[]): string {
  if (interactions.length === 0) return "";

  const lines: string[] = [];
  lines.push("\n═══ Interaction Patterns ═══");
  for (const interaction of interactions) {
    lines.push(`\n▶ ${interaction.title}`);
    lines.push(`Rules: ${interaction.rule_numbers}`);
    lines.push(interaction.breakdown);
    lines.push(`⚠ Common LLM error: ${interaction.common_error}`);
  }
  return lines.join("\n");
}

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

  // Auto-match interaction patterns by rule number
  const allRuleNumbers = [...matchedNumbers, ...seeAlsoRefs];
  const interactions = await searchInteractionsByRuleNumber(db, allRuleNumbers);
  lines.push(formatInteractions(interactions));

  // Reasoning guide
  lines.push(REASONING_GUIDE);

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

  // Auto-match interaction patterns by keyword (independent of rules results)
  const interactions = await searchInteractionsByKeyword(db, queryText);

  if (topIds.length === 0 && interactions.length === 0) {
    return {
      type: "text",
      content: `No rules found matching keyword "${queryText}". Try a different keyword, or use the "rule" parameter with a specific rule number.\n`,
    };
  }

  const lines: string[] = [];
  lines.push(`${RULES_HEADER}\n`);

  if (topIds.length > 0) {
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

    lines.push(`${orderedRules.length} rules matching keyword "${queryText}" (${searchMethod} search, ${totalMatches > orderedRules.length ? `showing top ${orderedRules.length} of ~${totalMatches}` : `${orderedRules.length} total`})\n`);
    for (const r of orderedRules) {
      lines.push(`${r.number} ${r.text}`);
    }

    // Add guidance
    lines.push("\n---");
    lines.push("These rules are ranked by relevance. To get the full text of a specific rule including examples and cross-references, query by rule number (e.g., rule=\"702.2\").");
    lines.push("IMPORTANT: Always cite specific rule numbers when explaining interactions to the player. Do not paraphrase rules from memory — use the text above.");
  }

  lines.push(formatInteractions(interactions));

  // Reasoning guide
  lines.push(REASONING_GUIDE);

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
