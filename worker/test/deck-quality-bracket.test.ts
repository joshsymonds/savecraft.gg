import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { assessBracket } from "../../plugins/magic/reference/deck-quality";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

const ATRAXA_ID = "atraxa-id";

describe("assessBracket", () => {
  beforeEach(async () => {
    await cleanAll();
  });

  async function seedRolesAndGameChangers(): Promise<void> {
    // Mass land destruction signal — Armageddon, Wildfire, Apocalypse.
    // Bracket-critical: any MLD card floors a deck at Bracket 4.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("armageddon-id", "Armageddon", "land_destruction", "LEA"),
      env.DB.prepare(
        `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("wildfire-id", "Wildfire", "land_destruction", "5ED"),
      env.DB.prepare(
        `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("apocalypse-id", "Apocalypse", "land_destruction", "TMP"),
      // Extra-turn signal
      env.DB.prepare(
        `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("time-warp-id", "Time Warp", "extra_turn", "TMP"),
      env.DB.prepare(
        `INSERT INTO magic_card_roles (oracle_id, front_face_name, role, set_code) VALUES (?, ?, ?, ?)`,
      ).bind("temporal-manipulation-id", "Temporal Manipulation", "extra_turn", "VIS"),
      // Game Changers — official WotC list, presence floors at Bracket 3.
      env.DB.prepare(`INSERT INTO magic_game_changers (card_name) VALUES (?)`).bind(
        "Cyclonic Rift",
      ),
      env.DB.prepare(`INSERT INTO magic_game_changers (card_name) VALUES (?)`).bind(
        "Smothering Tithe",
      ),
      env.DB.prepare(`INSERT INTO magic_game_changers (card_name) VALUES (?)`).bind(
        "Demonic Tutor",
      ),
      env.DB.prepare(`INSERT INTO magic_game_changers (card_name) VALUES (?)`).bind(
        "Thassa's Oracle",
      ),
      env.DB.prepare(`INSERT INTO magic_game_changers (card_name) VALUES (?)`).bind("Mana Crypt"),
    ]);
  }

  async function seedAtraxaWithCombo(): Promise<void> {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count, rank)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        ATRAXA_ID,
        "Atraxa, Praetors' Voice",
        "atraxa-praetors-voice",
        '["W","U","B","G"]',
        40_000,
        3,
      ),
      // Classic 2-card combo: Thassa's Oracle + Demonic Consultation = win
      env.DB.prepare(
        `INSERT INTO magic_edh_combos (commander_id, combo_id, card_names, card_ids, colors, results, deck_count, percentage)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        ATRAXA_ID,
        "1234-5678",
        '["Thassa\'s Oracle","Demonic Consultation"]',
        "[]",
        "WUBG",
        '["win the game"]',
        500,
        12.5,
      ),
    ]);
  }

  it("empty deck returns bracket 1 with no signals", async () => {
    await seedRolesAndGameChangers();
    const result = await assessBracket(env as unknown as Env, [], {
      scryfall_id: ATRAXA_ID,
      name: "Atraxa, Praetors' Voice",
    });
    expect(result.tier).toBe(1);
    expect(result.signals.game_changers).toEqual([]);
    expect(result.signals.mld_cards).toEqual([]);
    expect(result.signals.extra_turn_cards).toEqual([]);
    expect(result.signals.infinite_combos).toEqual([]);
  });

  it("deck with one Game Changer floors at bracket 3", async () => {
    await seedRolesAndGameChangers();
    const result = await assessBracket(
      env as unknown as Env,
      [{ card_name: "Cyclonic Rift" }, { card_name: "Sol Ring" }],
      { scryfall_id: ATRAXA_ID, name: "Atraxa, Praetors' Voice" },
    );
    expect(result.tier).toBeGreaterThanOrEqual(3);
    expect(result.signals.game_changers).toContain("Cyclonic Rift");
    expect(result.reasons.some((r) => r.toLowerCase().includes("game changer"))).toBe(true);
  });

  it("deck with Armageddon (MLD) floors at bracket 4", async () => {
    await seedRolesAndGameChangers();
    const result = await assessBracket(
      env as unknown as Env,
      [{ card_name: "Armageddon" }, { card_name: "Sol Ring" }],
      { scryfall_id: ATRAXA_ID, name: "Atraxa, Praetors' Voice" },
    );
    expect(result.tier).toBeGreaterThanOrEqual(4);
    expect(result.signals.mld_cards).toContain("Armageddon");
    expect(result.reasons.some((r) => r.toLowerCase().includes("land"))).toBe(true);
  });

  it("matches a known combo from magic_edh_combos", async () => {
    await seedRolesAndGameChangers();
    await seedAtraxaWithCombo();
    const result = await assessBracket(
      env as unknown as Env,
      [
        { card_name: "Thassa's Oracle" },
        { card_name: "Demonic Consultation" },
        { card_name: "Sol Ring" },
      ],
      { scryfall_id: ATRAXA_ID, name: "Atraxa, Praetors' Voice" },
    );
    expect(result.signals.infinite_combos.length).toBe(1);
    expect(result.signals.infinite_combos[0]?.card_names).toEqual([
      "Thassa's Oracle",
      "Demonic Consultation",
    ]);
    expect(result.tier).toBeGreaterThanOrEqual(3);
  });

  it("does NOT match a combo when only one piece is present", async () => {
    await seedRolesAndGameChangers();
    await seedAtraxaWithCombo();
    const result = await assessBracket(
      env as unknown as Env,
      [{ card_name: "Thassa's Oracle" }], // missing Demonic Consultation
      { scryfall_id: ATRAXA_ID, name: "Atraxa, Praetors' Voice" },
    );
    expect(result.signals.infinite_combos).toEqual([]);
  });

  it("cEDH-shape deck (multiple GCs + combo + MLD) reaches bracket 5", async () => {
    await seedRolesAndGameChangers();
    await seedAtraxaWithCombo();
    const result = await assessBracket(
      env as unknown as Env,
      [
        { card_name: "Mana Crypt" },
        { card_name: "Demonic Tutor" },
        { card_name: "Cyclonic Rift" },
        { card_name: "Smothering Tithe" },
        { card_name: "Thassa's Oracle" },
        { card_name: "Demonic Consultation" },
        { card_name: "Armageddon" },
        { card_name: "Time Warp" },
      ],
      { scryfall_id: ATRAXA_ID, name: "Atraxa, Praetors' Voice" },
    );
    expect(result.tier).toBe(5);
    expect(result.signals.game_changers.length).toBeGreaterThanOrEqual(4);
    expect(result.signals.infinite_combos.length).toBeGreaterThanOrEqual(1);
    expect(result.signals.mld_cards.length).toBeGreaterThanOrEqual(1);
  });

  it("precon-shape deck (no signals) returns bracket 1", async () => {
    await seedRolesAndGameChangers();
    const result = await assessBracket(
      env as unknown as Env,
      [
        { card_name: "Sol Ring" },
        { card_name: "Cultivate" },
        { card_name: "Forest" },
        { card_name: "Plains" },
      ],
      { scryfall_id: ATRAXA_ID, name: "Atraxa, Praetors' Voice" },
    );
    expect(result.tier).toBe(1);
  });

  it("rationale string is non-empty and mentions a dominant signal", async () => {
    await seedRolesAndGameChangers();
    const result = await assessBracket(env as unknown as Env, [{ card_name: "Armageddon" }], {
      scryfall_id: ATRAXA_ID,
      name: "Atraxa, Praetors' Voice",
    });
    expect(result.rationale.length).toBeGreaterThan(0);
    expect(result.rationale.toLowerCase()).toMatch(/land|bracket\s*4/);
  });

  it("matches case-insensitively on card names", async () => {
    await seedRolesAndGameChangers();
    const result = await assessBracket(
      env as unknown as Env,
      [{ card_name: "armageddon" }, { card_name: "CYCLONIC RIFT" }],
      { scryfall_id: ATRAXA_ID, name: "Atraxa, Praetors' Voice" },
    );
    expect(result.signals.mld_cards).toContain("Armageddon");
    expect(result.signals.game_changers).toContain("Cyclonic Rift");
  });

  it("two extra-turn cards push tier to 4", async () => {
    await seedRolesAndGameChangers();
    const result = await assessBracket(
      env as unknown as Env,
      [{ card_name: "Time Warp" }, { card_name: "Temporal Manipulation" }],
      { scryfall_id: ATRAXA_ID, name: "Atraxa, Praetors' Voice" },
    );
    expect(result.tier).toBeGreaterThanOrEqual(4);
    expect(result.signals.extra_turn_cards.length).toBe(2);
  });
});
