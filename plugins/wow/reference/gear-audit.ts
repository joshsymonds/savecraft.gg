/**
 * WoW gear_audit — native reference module.
 *
 * Cross-references equipped_gear save section to flag obvious issues:
 * missing enchants on enchantable slots, empty gem sockets, and items
 * significantly below the character's average item level.
 *
 * This does NOT compute stat weights, DPS sims, or BiS recommendations.
 * That's SimC/Raidbots territory. This flags things a player might have
 * simply overlooked.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
  SectionMapping,
} from "../../../worker/src/reference/types";

// ---------------------------------------------------------------------------
// Enchantable slots (Midnight — updated per expansion)
// ---------------------------------------------------------------------------

/**
 * Slots where enchants are commonly available and expected.
 * This is expansion-specific configuration, not hardcoded game knowledge.
 * Update when a new expansion changes which slots accept enchants.
 */
const ENCHANTABLE_SLOTS = new Set([
  "Back",
  "Chest",
  "Wrist",
  "Legs",
  "Feet",
  "Finger 1",
  "Finger 2",
  "Main Hand",
  "Off Hand",
]);

/** Slots to exclude from ilvl outlier analysis (cosmetic, always ilvl 1). */
const COSMETIC_SLOTS = new Set(["Shirt", "Tabard"]);

/** How many ilvl below average counts as an outlier. */
const ILVL_OUTLIER_THRESHOLD = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GearItem {
  slot: string;
  name: string;
  item_level: number;
  quality: string;
  enchantments: Array<{ description: string; source: string | null }>;
  sockets: Array<{ gem: string; effect: string }>;
  set_bonus: string | null;
}

interface GearSection {
  items: GearItem[];
}

interface AuditIssue {
  type: "missing_enchant" | "empty_socket" | "ilvl_outlier";
  slot: string;
  item_name: string;
  item_level: number;
  detail: string;
}

// ---------------------------------------------------------------------------
// Audit checks
// ---------------------------------------------------------------------------

function checkEnchants(items: GearItem[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  for (const item of items) {
    if (ENCHANTABLE_SLOTS.has(item.slot) && item.enchantments.length === 0) {
      issues.push({
        type: "missing_enchant",
        slot: item.slot,
        item_name: item.name,
        item_level: item.item_level,
        detail: `${item.slot} (${item.name}) has no enchant`,
      });
    }
  }
  return issues;
}

function checkSockets(items: GearItem[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  for (const item of items) {
    for (const socket of item.sockets) {
      if (socket.gem === "Empty") {
        issues.push({
          type: "empty_socket",
          slot: item.slot,
          item_name: item.name,
          item_level: item.item_level,
          detail: `${item.slot} (${item.name}) has an empty gem socket`,
        });
      }
    }
  }
  return issues;
}

function checkIlvlOutliers(items: GearItem[]): AuditIssue[] {
  // Filter out cosmetic items for average calculation
  const gearItems = items.filter((i) => !COSMETIC_SLOTS.has(i.slot));
  if (gearItems.length < 3) return []; // Need enough items to compute meaningful average

  const totalIlvl = gearItems.reduce((sum, i) => sum + i.item_level, 0);
  const avgIlvl = totalIlvl / gearItems.length;

  const issues: AuditIssue[] = [];
  for (const item of gearItems) {
    const diff = avgIlvl - item.item_level;
    if (diff >= ILVL_OUTLIER_THRESHOLD) {
      issues.push({
        type: "ilvl_outlier",
        slot: item.slot,
        item_name: item.name,
        item_level: item.item_level,
        detail: `${item.slot} (${item.name}) is ilvl ${item.item_level}, ${Math.round(diff)} below average (${Math.round(avgIlvl)})`,
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const gearAuditModule: NativeReferenceModule = {
  id: "gear_audit",
  name: "Gear Audit",
  description: [
    "Audits a WoW character's equipped gear for obvious issues: missing enchants, empty gem sockets, and item level outliers.",
    "Requires the player's save_id to read their equipped_gear section. Does NOT compute stat weights or BiS — just flags things the player may have overlooked.",
  ].join(" "),
  parameters: {
    save_id: {
      type: "string",
      description: "The player's save UUID. Required to read equipped gear data.",
    },
    check: {
      type: "string",
      description:
        "What to check: 'all' (default), 'enchants', 'gems', 'ilvl'. Multiple checks separated by comma.",
    },
    gear_data: {
      type: "object",
      description:
        "Direct gear data (for testing). Normally populated via section mapping from save_id.",
    },
  },

  sectionMappings: [
    {
      sectionParam: "save_id",
      extract: (sectionData: unknown): Record<string, unknown> => {
        return { gear_data: sectionData };
      },
    } satisfies SectionMapping,
  ],

  async execute(
    query: Record<string, unknown>,
    _env: Env,
  ): Promise<ReferenceResult> {
    const gearData = query.gear_data as GearSection | undefined;
    if (!gearData?.items) {
      return {
        type: "text",
        content:
          "No gear data available. Provide a save_id parameter so equipped_gear can be loaded, or pass gear_data directly.",
      };
    }

    const checks = typeof query.check === "string"
      ? query.check.split(",").map((c) => c.trim())
      : ["all"];
    const checkAll = checks.includes("all");

    const issues: AuditIssue[] = [];

    if (checkAll || checks.includes("enchants")) {
      issues.push(...checkEnchants(gearData.items));
    }
    if (checkAll || checks.includes("gems")) {
      issues.push(...checkSockets(gearData.items));
    }
    if (checkAll || checks.includes("ilvl")) {
      issues.push(...checkIlvlOutliers(gearData.items));
    }

    // Compute summary stats
    const gearItems = gearData.items.filter((i) => !COSMETIC_SLOTS.has(i.slot));
    const avgIlvl = gearItems.length > 0
      ? Math.round(gearItems.reduce((sum, i) => sum + i.item_level, 0) / gearItems.length)
      : 0;

    return {
      type: "structured",
      data: {
        summary: {
          total_items: gearData.items.length,
          gear_items: gearItems.length,
          average_ilvl: avgIlvl,
          issues_found: issues.length,
        },
        issues,
        checks_performed: checkAll ? ["enchants", "gems", "ilvl"] : checks,
      },
    };
  },
};
