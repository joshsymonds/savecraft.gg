/**
 * precon_lookup — native reference module.
 *
 * Surfaces EDHREC's per-precon data (decklists + upgrade pools + face
 * commanders + MSRP) ingested by edhrec-fetch into the four
 * magic_edh_precon_* tables. Three resolution modes:
 *
 *   1. slug=...     → exact match
 *   2. commander=...→ precons referencing that commander (face or alternate)
 *   3. browse       → filter by colors and/or max_price; orders by
 *                     deck-count of the face commander
 */

import type { Env } from "../../../worker/src/types";
import type { NativeReferenceModule, ReferenceResult } from "../../../worker/src/reference/types";
import { buildJSONSubsetExpr, isValidColors } from "./wubrg";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

interface PreconRow {
  slug: string;
  name: string;
  msrp_usd: number | null;
  set_code: string | null;
  release_year: number | null;
}

interface DeckRow {
  precon_slug: string;
  card_name: string;
  quantity: number;
  category: string;
}

interface UpgradeRow {
  precon_slug: string;
  card_name: string;
  action: string;
  inclusion: number;
}

interface CommanderRefRow {
  precon_slug: string;
  commander_name: string;
  deck_count: number;
  is_face: number;
}

export const preconLookupModule: NativeReferenceModule = {
  id: "precon_lookup",
  name: "Precon Lookup",
  description: [
    "Find Magic: The Gathering Commander preconstructed decks (precons) by face commander, color identity, or budget.",
    "USE PROACTIVELY when a player asks about a specific precon, what precons exist for a commander, or wants budget-friendly precon recommendations.",
    "Three modes: pass `slug` for an exact precon (e.g. 'breed-lethality'), `commander` for precons referencing that commander (face or alternate), or browse with `colors`/`max_price` filters.",
    "Output includes face commander, alternate commanders, full decklist, and upgrade pools (cardstoadd, cardstocut, landstoadd, landstocut from EDHREC).",
    "When evaluating budget upgrade paths ('precon + $60 of singles'), the upgrades.add list is the recommended pool and msrp_usd is the precon's retail anchor.",
  ].join(" "),
  parameters: {
    slug: {
      type: "string",
      description: "Exact precon slug (e.g. 'breed-lethality'). When set, returns just that precon.",
    },
    commander: {
      type: "string",
      description:
        "Find precons that reference this commander (face or alternate). Exact-match on the commander name as it appears on EDHREC.",
    },
    colors: {
      type: "string",
      description:
        "Browse mode color filter (WUBRG letters). Subset semantics — 'BG' returns BG, mono-B, mono-G, and colorless precons. Empty string = colorless only.",
    },
    max_price: {
      type: "number",
      description:
        "Browse mode USD ceiling on MSRP. Precons with NULL MSRP (not in our hardcoded catalog) are EXCLUDED from filtered results.",
    },
    include_deck: {
      type: "boolean",
      description: "Include the full decklist for each returned precon (default true).",
    },
    include_upgrades: {
      type: "boolean",
      description: "Include the cardstoadd/cardstocut/landstoadd/landstocut pools (default true).",
    },
    limit: {
      type: "integer",
      description: "Max precons returned (default 5, max 20).",
    },
  },

  async execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult> {
    const slug = ((query.slug as string) ?? "").trim();
    const commander = ((query.commander as string) ?? "").trim();
    const rawColors = (query.colors as string | undefined) ?? undefined;
    const maxPrice = typeof query.max_price === "number" ? query.max_price : undefined;
    const includeDeck = query.include_deck !== false;
    const includeUpgrades = query.include_upgrades !== false;
    const limit = Math.max(
      1,
      Math.min(MAX_LIMIT, (query.limit as number | undefined) ?? DEFAULT_LIMIT),
    );

    let precons: PreconRow[];

    if (slug) {
      const result = await env.DB
        .prepare(
          `SELECT slug, name, msrp_usd, set_code, release_year
           FROM magic_edh_precons
           WHERE slug = ?`,
        )
        .bind(slug)
        .all<PreconRow>();
      precons = result.results ?? [];
      if (precons.length === 0) {
        return {
          type: "text",
          content: `Precon not found: "${slug}". Use commander or colors filters to browse precons we know about.`,
        };
      }
    } else if (commander) {
      // JOIN on magic_edh_precon_commanders.commander_name. Order: face
      // commander first, then by EDHREC popularity.
      // LIKE-prefix subsumes equality match — a single param covers both.
      const result = await env.DB
        .prepare(
          `SELECT DISTINCT p.slug, p.name, p.msrp_usd, p.set_code, p.release_year
           FROM magic_edh_precons p
           JOIN magic_edh_precon_commanders pc ON pc.precon_slug = p.slug
           WHERE pc.commander_name LIKE ? || '%'
           ORDER BY (SELECT MAX(is_face) FROM magic_edh_precon_commanders
                    WHERE precon_slug = p.slug AND commander_name LIKE ? || '%') DESC,
                    p.release_year DESC
           LIMIT ?`,
        )
        .bind(commander, commander, limit)
        .all<PreconRow>();
      precons = result.results ?? [];
    } else {
      // Browse mode. JOIN to magic_edh_commanders (via face commander) for
      // color-identity filtering. NULL msrp is excluded when max_price is
      // set since we can't certify those under budget.
      const conditions: string[] = [];
      const binds: unknown[] = [];

      if (maxPrice !== undefined) {
        conditions.push("p.msrp_usd IS NOT NULL AND p.msrp_usd <= ?");
        binds.push(maxPrice);
      }

      let colorJoin = "";
      if (rawColors !== undefined) {
        if (!isValidColors(rawColors)) {
          return {
            type: "text",
            content: `Invalid colors value: "${rawColors}". Use WUBRG letters only (or empty string for colorless).`,
          };
        }
        // Resolve face commander → its color identity. Reject precons whose
        // face has a color outside the allowed letters.
        colorJoin = `
          JOIN magic_edh_precon_commanders pcface
            ON pcface.precon_slug = p.slug AND pcface.is_face = 1
          JOIN magic_edh_commanders cface
            ON cface.name = pcface.commander_name
        `;
        conditions.push(`${buildJSONSubsetExpr(rawColors.toUpperCase(), "cface.color_identity")} = ''`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const sql = `
        SELECT p.slug, p.name, p.msrp_usd, p.set_code, p.release_year
        FROM magic_edh_precons p
        ${colorJoin}
        ${whereClause}
        ORDER BY p.msrp_usd ASC, p.release_year DESC
        LIMIT ?
      `;
      binds.push(limit);

      const result = await env.DB.prepare(sql).bind(...binds).all<PreconRow>();
      precons = result.results ?? [];
    }

    if (precons.length === 0) {
      return {
        type: "structured",
        data: { precons: [], count: 0 },
      };
    }

    // Batch-fetch supporting data for all returned precons in 3 parallel queries.
    const slugs = precons.map((p) => p.slug);
    const placeholders = slugs.map(() => "?").join(",");
    const [commandersRes, deckRes, upgradesRes] = await Promise.all([
      env.DB
        .prepare(
          `SELECT precon_slug, commander_name, deck_count, is_face
           FROM magic_edh_precon_commanders
           WHERE precon_slug IN (${placeholders})
           ORDER BY is_face DESC, deck_count DESC`,
        )
        .bind(...slugs)
        .all<CommanderRefRow>(),
      includeDeck
        ? env.DB
            .prepare(
              `SELECT precon_slug, card_name, quantity, category
               FROM magic_edh_precon_decks
               WHERE precon_slug IN (${placeholders})
               ORDER BY category, card_name`,
            )
            .bind(...slugs)
            .all<DeckRow>()
        : Promise.resolve({ results: [] as DeckRow[] }),
      includeUpgrades
        ? env.DB
            .prepare(
              `SELECT precon_slug, card_name, action, inclusion
               FROM magic_edh_precon_upgrades
               WHERE precon_slug IN (${placeholders})
               ORDER BY action, inclusion DESC`,
            )
            .bind(...slugs)
            .all<UpgradeRow>()
        : Promise.resolve({ results: [] as UpgradeRow[] }),
    ]);

    // Group children by precon_slug.
    const commandersBySlug = new Map<string, CommanderRefRow[]>();
    for (const row of commandersRes.results ?? []) {
      const arr = commandersBySlug.get(row.precon_slug) ?? [];
      arr.push(row);
      commandersBySlug.set(row.precon_slug, arr);
    }
    const deckBySlug = new Map<string, DeckRow[]>();
    for (const row of deckRes.results ?? []) {
      const arr = deckBySlug.get(row.precon_slug) ?? [];
      arr.push(row);
      deckBySlug.set(row.precon_slug, arr);
    }
    const upgradesBySlug = new Map<string, UpgradeRow[]>();
    for (const row of upgradesRes.results ?? []) {
      const arr = upgradesBySlug.get(row.precon_slug) ?? [];
      arr.push(row);
      upgradesBySlug.set(row.precon_slug, arr);
    }

    const out = precons.map((p) => {
      const cmdrs = commandersBySlug.get(p.slug) ?? [];
      const face = cmdrs.find((c) => c.is_face === 1);
      const alternates = cmdrs.filter((c) => c.is_face !== 1);

      const entry: Record<string, unknown> = {
        slug: p.slug,
        name: p.name,
        msrp_usd: p.msrp_usd,
        set_code: p.set_code,
        release_year: p.release_year,
        face_commander: face
          ? { name: face.commander_name, deck_count: face.deck_count }
          : null,
        alternate_commanders: alternates.map((c) => ({
          name: c.commander_name,
          deck_count: c.deck_count,
        })),
      };

      if (includeDeck) {
        entry.deck = (deckBySlug.get(p.slug) ?? []).map((d) => ({
          card_name: d.card_name,
          quantity: d.quantity,
          category: d.category,
        }));
      }

      if (includeUpgrades) {
        const grouped: Record<string, { card_name: string; inclusion: number }[]> = {
          add: [],
          cut: [],
          land_add: [],
          land_cut: [],
        };
        for (const u of upgradesBySlug.get(p.slug) ?? []) {
          const bucket = grouped[u.action];
          if (bucket) {
            bucket.push({ card_name: u.card_name, inclusion: u.inclusion });
          }
        }
        entry.upgrades = grouped;
      }

      return entry;
    });

    return {
      type: "structured",
      data: {
        precons: out,
        count: out.length,
        attribution: {
          source: "EDHREC",
          note: "Precon decklists, upgrade pools, and commander references from EDHREC. MSRP from a hand-maintained catalog (~20 precons covered as of M3.1) — NULL when out of catalog. Singles-market prices for precon contents may vary substantially from MSRP.",
        },
      },
    };
  },
};
