import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { gearAuditModule } from "../../plugins/wow/reference/gear-audit";

import { cleanAll } from "./helpers";

// ---------------------------------------------------------------------------
// Fake equipped_gear section data (matches mapItem output shape)
// ---------------------------------------------------------------------------

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    slot: "Chest",
    name: "Test Chestplate",
    item_level: 620,
    quality: "Epic",
    item_class: "Armor",
    item_subclass: "Plate",
    stats: [{ type: "Strength", value: 100 }],
    enchantments: [{ description: "Enchanted: Crystalline Radiance", source: null }],
    sockets: [],
    set_bonus: null,
    ...overrides,
  };
}

function makeGearSection(items: Record<string, unknown>[]) {
  return { items };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("gear_audit reference module", () => {
  beforeEach(cleanAll);

  it("flags item with missing enchant on enchantable slot", async () => {
    const gear = makeGearSection([
      makeItem({ slot: "Chest", enchantments: [] }), // Missing enchant
      makeItem({
        slot: "Back",
        enchantments: [{ description: "Enchanted: Avoidance", source: null }],
      }),
    ]);

    const result = await gearAuditModule.execute({ gear_data: gear }, env);

    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const issues = data.issues as Record<string, unknown>[];
    const enchantIssues = issues.filter((index) => index.type === "missing_enchant");
    expect(enchantIssues.length).toBe(1);
    expect(enchantIssues[0]!.slot).toBe("Chest");
  });

  it("flags item with empty gem socket", async () => {
    const gear = makeGearSection([
      makeItem({
        slot: "Head",
        sockets: [{ gem: "Empty", effect: "" }],
      }),
    ]);

    const result = await gearAuditModule.execute({ gear_data: gear }, env);

    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const issues = data.issues as Record<string, unknown>[];
    const socketIssues = issues.filter((index) => index.type === "empty_socket");
    expect(socketIssues.length).toBe(1);
    expect(socketIssues[0]!.slot).toBe("Head");
  });

  it("flags ilvl outlier (item significantly below average)", async () => {
    const gear = makeGearSection([
      makeItem({ slot: "Head", item_level: 620 }),
      makeItem({ slot: "Shoulders", item_level: 620 }),
      makeItem({ slot: "Chest", item_level: 620 }),
      makeItem({ slot: "Legs", item_level: 620 }),
      makeItem({ slot: "Feet", item_level: 620 }),
      makeItem({ slot: "Hands", item_level: 620 }),
      makeItem({ slot: "Back", item_level: 620 }),
      makeItem({ slot: "Wrist", item_level: 620 }),
      makeItem({ slot: "Waist", item_level: 620 }),
      makeItem({ slot: "Finger 1", item_level: 620 }),
      makeItem({ slot: "Finger 2", item_level: 620 }),
      makeItem({ slot: "Trinket 1", item_level: 550 }), // Outlier: 70 below average
    ]);

    const result = await gearAuditModule.execute({ gear_data: gear }, env);

    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const issues = data.issues as Record<string, unknown>[];
    const ilvlIssues = issues.filter((index) => index.type === "ilvl_outlier");
    expect(ilvlIssues.length).toBe(1);
    expect(ilvlIssues[0]!.slot).toBe("Trinket 1");
    expect(ilvlIssues[0]!.item_level).toBe(550);
  });

  it("returns no issues for clean gear", async () => {
    const gear = makeGearSection([
      makeItem({
        slot: "Chest",
        item_level: 620,
        enchantments: [{ description: "Enchanted: Something", source: null }],
      }),
      makeItem({
        slot: "Back",
        item_level: 618,
        enchantments: [{ description: "Enchanted: Something", source: null }],
      }),
      makeItem({
        slot: "Finger 1",
        item_level: 620,
        enchantments: [{ description: "Enchanted: Something", source: null }],
      }),
    ]);

    const result = await gearAuditModule.execute({ gear_data: gear }, env);

    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const issues = data.issues as Record<string, unknown>[];
    expect(issues.length).toBe(0);
  });

  it("returns error text when no gear data provided", async () => {
    const result = await gearAuditModule.execute({}, env);
    expect(result.type).toBe("text");
  });

  it("has correct module metadata", () => {
    expect(gearAuditModule.id).toBe("gear_audit");
    expect(gearAuditModule.name).toBe("Gear Audit");
    expect(gearAuditModule.parameters).toBeDefined();
    expect(gearAuditModule.sectionMappings).toBeDefined();
    expect(gearAuditModule.sectionMappings!.length).toBeGreaterThan(0);
  });
});
