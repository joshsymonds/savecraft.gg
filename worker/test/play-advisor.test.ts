import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { playAdvisorModule } from "../../plugins/mtga/reference/play-advisor";
import { registerNativeModule } from "../src/reference/registry";

import { cleanAll } from "./helpers";

// ── Seed helpers ─────────────────────────────────────────────

async function seedCardTiming(): Promise<void> {
  const rows = [
    // Gleaming Barrier timing: better when played on turn 2
    {
      set: "FDN",
      card: "Gleaming Barrier",
      arch: "UB",
      turn: 1,
      deployed: 100,
      won: 45,
      total: 100,
    },
    {
      set: "FDN",
      card: "Gleaming Barrier",
      arch: "UB",
      turn: 2,
      deployed: 200,
      won: 110,
      total: 200,
    },
    { set: "FDN", card: "Gleaming Barrier", arch: "UB", turn: 3, deployed: 80, won: 35, total: 80 },
    {
      set: "FDN",
      card: "Gleaming Barrier",
      arch: "ALL",
      turn: 1,
      deployed: 150,
      won: 70,
      total: 150,
    },
    {
      set: "FDN",
      card: "Gleaming Barrier",
      arch: "ALL",
      turn: 2,
      deployed: 300,
      won: 165,
      total: 300,
    },
    {
      set: "FDN",
      card: "Gleaming Barrier",
      arch: "ALL",
      turn: 3,
      deployed: 120,
      won: 52,
      total: 120,
    },
    // Kaito timing: best on turn 3
    {
      set: "FDN",
      card: "Kaito, Cunning Infiltrator",
      arch: "UB",
      turn: 3,
      deployed: 150,
      won: 90,
      total: 150,
    },
    {
      set: "FDN",
      card: "Kaito, Cunning Infiltrator",
      arch: "UB",
      turn: 4,
      deployed: 120,
      won: 65,
      total: 120,
    },
    {
      set: "FDN",
      card: "Kaito, Cunning Infiltrator",
      arch: "UB",
      turn: 5,
      deployed: 80,
      won: 38,
      total: 80,
    },
    {
      set: "FDN",
      card: "Kaito, Cunning Infiltrator",
      arch: "ALL",
      turn: 3,
      deployed: 200,
      won: 120,
      total: 200,
    },
    {
      set: "FDN",
      card: "Kaito, Cunning Infiltrator",
      arch: "ALL",
      turn: 4,
      deployed: 180,
      won: 95,
      total: 180,
    },
    {
      set: "FDN",
      card: "Kaito, Cunning Infiltrator",
      arch: "ALL",
      turn: 5,
      deployed: 100,
      won: 45,
      total: 100,
    },
  ];
  for (const r of rows) {
    await env.DB.prepare(
      `INSERT INTO mtga_play_card_timing (set_code, card_name, archetype, turn_number, times_deployed, games_won, total_games)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(r.set, r.card, r.arch, r.turn, r.deployed, r.won, r.total)
      .run();
  }
}

async function seedTempo(): Promise<void> {
  const rows = [
    // UB tempo: mana_spent_bucket 0-5 for turn 3, on_play=1
    { set: "FDN", arch: "UB", turn: 3, onPlay: 1, bucket: 0, won: 20, total: 50 },
    { set: "FDN", arch: "UB", turn: 3, onPlay: 1, bucket: 1, won: 25, total: 55 },
    { set: "FDN", arch: "UB", turn: 3, onPlay: 1, bucket: 2, won: 40, total: 70 },
    { set: "FDN", arch: "UB", turn: 3, onPlay: 1, bucket: 3, won: 60, total: 100 },
    { set: "FDN", arch: "ALL", turn: 3, onPlay: 1, bucket: 0, won: 30, total: 80 },
    { set: "FDN", arch: "ALL", turn: 3, onPlay: 1, bucket: 3, won: 90, total: 150 },
  ];
  for (const r of rows) {
    await env.DB.prepare(
      `INSERT INTO mtga_play_tempo (set_code, archetype, turn_number, on_play, mana_spent_bucket, games_won, total_games)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(r.set, r.arch, r.turn, r.onPlay, r.bucket, r.won, r.total)
      .run();
  }
}

async function seedCombat(): Promise<void> {
  const rows = [
    // Gleaming Barrier: better to hold back when opponent has creatures
    {
      set: "FDN",
      attacker: "Gleaming Barrier",
      turn: 3,
      userC: 2,
      oppoC: 2,
      attacked: 1,
      won: 30,
      total: 80,
    },
    {
      set: "FDN",
      attacker: "Gleaming Barrier",
      turn: 3,
      userC: 2,
      oppoC: 2,
      attacked: 0,
      won: 50,
      total: 80,
    },
    // Gleaming Barrier: attack when opponent has no creatures
    {
      set: "FDN",
      attacker: "Gleaming Barrier",
      turn: 3,
      userC: 2,
      oppoC: 0,
      attacked: 1,
      won: 55,
      total: 80,
    },
    {
      set: "FDN",
      attacker: "Gleaming Barrier",
      turn: 3,
      userC: 2,
      oppoC: 0,
      attacked: 0,
      won: 30,
      total: 80,
    },
  ];
  for (const r of rows) {
    await env.DB.prepare(
      `INSERT INTO mtga_play_combat (set_code, attacker_name, turn_number, user_creatures_count, oppo_creatures_count, attacked, games_won, total_games)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(r.set, r.attacker, r.turn, r.userC, r.oppoC, r.attacked, r.won, r.total)
      .run();
  }
}

async function seedMulligan(): Promise<void> {
  const rows = [
    // UB on_play: 2 lands with mid-CMC nonlands is good
    { set: "FDN", arch: "UB", onPlay: 1, lands: 2, cmc: "mid", mulls: 0, won: 70, total: 120 },
    { set: "FDN", arch: "UB", onPlay: 1, lands: 3, cmc: "mid", mulls: 0, won: 65, total: 120 },
    { set: "FDN", arch: "UB", onPlay: 1, lands: 1, cmc: "high", mulls: 0, won: 30, total: 100 },
    { set: "FDN", arch: "UB", onPlay: 1, lands: 2, cmc: "mid", mulls: 1, won: 40, total: 100 },
    { set: "FDN", arch: "ALL", onPlay: 1, lands: 2, cmc: "mid", mulls: 0, won: 100, total: 180 },
  ];
  for (const r of rows) {
    await env.DB.prepare(
      `INSERT INTO mtga_play_mulligan (set_code, archetype, on_play, land_count, nonland_cmc_bucket, num_mulligans, games_won, total_games)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(r.set, r.arch, r.onPlay, r.lands, r.cmc, r.mulls, r.won, r.total)
      .run();
  }
}

async function seedBaselines(): Promise<void> {
  const rows = [
    {
      set: "FDN",
      arch: "UB",
      turn: 1,
      onPlay: 1,
      mana: 50,
      creatures: 10,
      spells: 15,
      attacked: 0,
      possible: 5,
      won: 30,
      total: 50,
    },
    {
      set: "FDN",
      arch: "UB",
      turn: 2,
      onPlay: 1,
      mana: 150,
      creatures: 40,
      spells: 45,
      attacked: 15,
      possible: 30,
      won: 30,
      total: 50,
    },
    {
      set: "FDN",
      arch: "UB",
      turn: 3,
      onPlay: 1,
      mana: 200,
      creatures: 35,
      spells: 50,
      attacked: 25,
      possible: 40,
      won: 30,
      total: 50,
    },
    {
      set: "FDN",
      arch: "ALL",
      turn: 1,
      onPlay: 1,
      mana: 80,
      creatures: 20,
      spells: 25,
      attacked: 0,
      possible: 10,
      won: 50,
      total: 100,
    },
    {
      set: "FDN",
      arch: "ALL",
      turn: 2,
      onPlay: 1,
      mana: 250,
      creatures: 70,
      spells: 80,
      attacked: 30,
      possible: 60,
      won: 50,
      total: 100,
    },
    {
      set: "FDN",
      arch: "ALL",
      turn: 3,
      onPlay: 1,
      mana: 380,
      creatures: 60,
      spells: 90,
      attacked: 50,
      possible: 80,
      won: 50,
      total: 100,
    },
  ];
  for (const r of rows) {
    await env.DB.prepare(
      `INSERT INTO mtga_play_turn_baselines (set_code, archetype, turn_number, on_play, total_mana_spent, total_creatures_cast, total_spells_cast, total_creatures_attacked, total_attacks_possible, games_won, total_games)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        r.set,
        r.arch,
        r.turn,
        r.onPlay,
        r.mana,
        r.creatures,
        r.spells,
        r.attacked,
        r.possible,
        r.won,
        r.total,
      )
      .run();
  }
}

async function seedCards(): Promise<void> {
  // Minimal card data needed for mulligan CMC lookup.
  const cards = [
    { id: 95_194, name: "Island", cmc: 0, type: "Basic Land — Island" },
    { id: 95_196, name: "Swamp", cmc: 0, type: "Basic Land — Swamp" },
    { id: 93_965, name: "Gleaming Barrier", cmc: 2, type: "Artifact Creature — Wall" },
    {
      id: 93_757,
      name: "Kaito, Cunning Infiltrator",
      cmc: 3,
      type: "Legendary Planeswalker — Kaito",
    },
    { id: 93_885, name: "Eaten Alive", cmc: 1, type: "Sorcery" },
    { id: 93_743, name: "Archmage of Runes", cmc: 5, type: "Creature — Giant Wizard" },
  ];
  for (const c of cards) {
    await env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, cmc, type_line, is_default, front_face_name)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    )
      .bind(c.id, `oracle-${String(c.id)}`, c.name, c.cmc, c.type, c.name)
      .run();
  }
}

async function seedAll(): Promise<void> {
  await Promise.all([
    seedCards(),
    seedCardTiming(),
    seedTempo(),
    seedCombat(),
    seedMulligan(),
    seedBaselines(),
  ]);
}

// ── Tests ────────────────────────────────────────────────────

describe("play_advisor reference module", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("mtga", playAdvisorModule);
    await seedAll();
  });

  it("returns card timing with best turn and win rates", async () => {
    const result = await playAdvisorModule.execute(
      {
        mode: "card_timing",
        set: "FDN",
        cards: ["Gleaming Barrier", "Kaito, Cunning Infiltrator"],
        archetype: "UB",
      },
      env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const cards = result.data.cards as {
      card_name: string;
      best_turn: number;
      best_win_rate: number;
      turns: unknown[];
    }[];
    const barrier = cards.find((c) => c.card_name === "Gleaming Barrier");
    expect(barrier).toBeDefined();
    expect(barrier!.best_turn).toBe(2);
    expect(barrier!.best_win_rate).toBeCloseTo(0.55, 2);
    const kaito = cards.find((c) => c.card_name === "Kaito, Cunning Infiltrator");
    expect(kaito).toBeDefined();
    expect(kaito!.best_turn).toBe(3);
    expect(kaito!.best_win_rate).toBeCloseTo(0.6, 2);
    expect(result.data.coverage).toEqual({ found: 2, total: 2 });
  });

  it("reports coverage for missing cards", async () => {
    const result = await playAdvisorModule.execute(
      {
        mode: "card_timing",
        set: "FDN",
        cards: ["Gleaming Barrier", "Nonexistent Card"],
        archetype: "UB",
      },
      env,
    );
    if (result.type !== "structured") throw new Error("unexpected type");
    expect(result.data.coverage).toEqual({ found: 1, total: 2 });
  });

  it("returns mana efficiency with ratings", async () => {
    const result = await playAdvisorModule.execute(
      {
        mode: "mana_efficiency",
        set: "FDN",
        archetype: "UB",
        on_play: true,
        turns: [
          { turn: 1, mana_spent: 0 },
          { turn: 2, mana_spent: 2 },
          { turn: 3, mana_spent: 3 },
        ],
      },
      env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const turns = result.data.turns as { turn: number; rating: string; bucket_win_rate: number }[];
    const t3 = turns.find((t) => t.turn === 3);
    expect(t3).toBeDefined();
    // Turn 3: avg mana = 200/50 = 4.0, player spent 3 → Low
    expect(t3!.rating).toBe("Low");
    // Turn 3 bucket 3 WR: 60/100 = 0.6
    expect(t3!.bucket_win_rate).toBeCloseTo(0.6, 2);
  });

  it("returns attack analysis with hold recommendation", async () => {
    const result = await playAdvisorModule.execute(
      {
        mode: "attack_analysis",
        set: "FDN",
        turns: [
          {
            turn: 3,
            creatures: ["Gleaming Barrier"],
            attacked: ["Gleaming Barrier"],
            oppo_creatures: 2,
            user_creatures: 2,
          },
        ],
      },
      env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const turns = result.data.turns as {
      turn: number;
      creatures: {
        creature: string;
        action: string;
        correct: boolean;
        best_action: string;
        attack_win_rate: number;
        hold_win_rate: number;
      }[];
    }[];
    const t3 = turns.find((t) => t.turn === 3);
    expect(t3).toBeDefined();
    const barrier = t3!.creatures.find((c) => c.creature === "Gleaming Barrier");
    expect(barrier).toBeDefined();
    expect(barrier!.correct).toBe(false);
    expect(barrier!.best_action).toBe("hold");
    expect(barrier!.attack_win_rate).toBeCloseTo(0.375, 2);
    expect(barrier!.hold_win_rate).toBeCloseTo(0.625, 2);
    expect(result.data.coverage).toEqual({ found: 1, total: 1 });
  });

  it("returns mulligan analysis with keep recommendation", async () => {
    const result = await playAdvisorModule.execute(
      {
        mode: "mulligan",
        set: "FDN",
        archetype: "UB",
        on_play: true,
        hand: [
          "Island",
          "Island",
          "Swamp",
          "Kaito, Cunning Infiltrator",
          "Gleaming Barrier",
          "Eaten Alive",
          "Archmage of Runes",
        ],
      },
      env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    expect(result.data.recommendation).toBe("KEEP");
  });

  it("returns game review analysis", async () => {
    const result = await playAdvisorModule.execute(
      {
        mode: "game_review",
        set: "FDN",
        archetype: "UB",
        on_play: true,
        turns: [
          {
            turn: 1,
            mana_spent: 0,
            cards_played: [],
            creatures_attacked: [],
            user_creatures: 0,
            oppo_creatures: 0,
          },
          {
            turn: 2,
            mana_spent: 2,
            cards_played: ["Gleaming Barrier"],
            creatures_attacked: [],
            user_creatures: 1,
            oppo_creatures: 0,
          },
          {
            turn: 3,
            mana_spent: 3,
            cards_played: ["Kaito, Cunning Infiltrator"],
            creatures_attacked: ["Gleaming Barrier"],
            user_creatures: 1,
            oppo_creatures: 2,
          },
        ],
      },
      env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    expect(result.data).toHaveProperty("findings");
    expect(result.data).toHaveProperty("coverage");
  });

  it("includes disclaimer for non-draft format", async () => {
    const result = await playAdvisorModule.execute(
      {
        mode: "card_timing",
        set: "FDN",
        cards: ["Gleaming Barrier"],
        archetype: "UB",
        format: "Standard",
      },
      env,
    );
    if (result.type !== "structured") throw new Error("unexpected type");
    expect(result.data.disclaimer).toContain("Premier Draft");
  });

  it("does not include disclaimer for PremierDraft format", async () => {
    const result = await playAdvisorModule.execute(
      {
        mode: "card_timing",
        set: "FDN",
        cards: ["Gleaming Barrier"],
        archetype: "UB",
        format: "PremierDraft",
      },
      env,
    );
    if (result.type !== "structured") throw new Error("unexpected type");
    expect(result.data.disclaimer).toBeUndefined();
  });

  it("falls back to ALL archetype when specific archetype has no data", async () => {
    const result = await playAdvisorModule.execute(
      {
        mode: "card_timing",
        set: "FDN",
        cards: ["Gleaming Barrier"],
        archetype: "WR", // no WR data seeded
      },
      env,
    );
    if (result.type !== "structured") throw new Error("unexpected type");
    const cards = result.data.cards as { card_name: string }[];
    expect(cards.some((c) => c.card_name === "Gleaming Barrier")).toBe(true);
    expect(result.data.coverage).toEqual({ found: 1, total: 1 });
  });

  it("game_review works via match_id lookup with battlefield data", async () => {
    const saveUuid = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(saveUuid, "user-play-test", "mtga", "mtga", "TestPlayer", "test")
      .run();

    const gameSection = JSON.stringify({
      matchId: "match-abc-123",
      turns: [
        {
          turnNumber: 1,
          activePlayer: 1,
          phase: "Phase_Main1",
          players: [
            { seat: 1, lifeTotal: 20, battlefield: [] },
            { seat: 2, lifeTotal: 20, battlefield: [] },
          ],
          actions: [
            {
              player: 1,
              type: "move",
              move: { cardName: "Island", cardId: 95_194, moveType: "play_land" },
            },
          ],
        },
        {
          turnNumber: 2,
          activePlayer: 1,
          phase: "Phase_Main1",
          players: [
            {
              seat: 1,
              lifeTotal: 20,
              battlefield: [
                {
                  cardName: "Gleaming Barrier",
                  cardId: 93_965,
                  cardTypes: ["CardType_Creature"],
                  power: 0,
                  toughness: 4,
                },
              ],
            },
            { seat: 2, lifeTotal: 20, battlefield: [] },
          ],
          actions: [
            {
              player: 1,
              type: "move",
              move: { cardName: "Island", cardId: 95_194, moveType: "play_land" },
            },
            {
              player: 1,
              type: "cast",
              cast: {
                cardName: "Gleaming Barrier",
                cardId: 93_965,
                manaPaid: [{ color: "Colorless", count: 2 }],
              },
            },
          ],
        },
        {
          turnNumber: 3,
          activePlayer: 1,
          phase: "Phase_Main1",
          players: [
            {
              seat: 1,
              lifeTotal: 20,
              battlefield: [
                {
                  cardName: "Gleaming Barrier",
                  cardId: 93_965,
                  cardTypes: ["CardType_Creature"],
                  power: 0,
                  toughness: 4,
                },
              ],
            },
            {
              seat: 2,
              lifeTotal: 20,
              battlefield: [
                {
                  cardName: "Ajani's Pridemate",
                  cardId: 93_848,
                  cardTypes: ["CardType_Creature"],
                  power: 2,
                  toughness: 2,
                },
                {
                  cardName: "Burnished Hart",
                  cardId: 93_963,
                  cardTypes: ["CardType_Creature"],
                  power: 2,
                  toughness: 2,
                },
              ],
            },
          ],
          actions: [
            {
              player: 1,
              type: "move",
              move: { cardName: "Island", cardId: 95_194, moveType: "play_land" },
            },
            {
              player: 1,
              type: "cast",
              cast: {
                cardName: "Kaito, Cunning Infiltrator",
                cardId: 93_757,
                manaPaid: [{ color: "Blue", count: 3 }],
              },
            },
          ],
        },
      ],
    });

    await env.DB.prepare(
      "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
    )
      .bind(saveUuid, "game:match-abc-123", "Game log", gameSection)
      .run();

    const result = await playAdvisorModule.execute(
      {
        mode: "game_review",
        set: "FDN",
        archetype: "UB",
        on_play: true,
        match_id: "match-abc-123",
        user_id: "user-play-test",
      },
      env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    expect(result.data).toHaveProperty("findings");
    expect(result.data).toHaveProperty("coverage");
    // Turn 3 has 1 user creature, 2 opponent creatures (extracted from battlefield)
  });

  it("game_review returns error when match_id not found", async () => {
    const saveUuid = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(saveUuid, "user-notfound", "mtga", "mtga", "TestPlayer", "test")
      .run();

    const result = await playAdvisorModule.execute(
      { mode: "game_review", set: "FDN", match_id: "nonexistent-match", user_id: "user-notfound" },
      env,
    );
    const content = (result as { type: "text"; content: string }).content;
    expect(content).toContain("not found");
  });

  it("returns error for unknown mode", async () => {
    const result = await playAdvisorModule.execute({ mode: "unknown_mode" }, env);
    const content = (result as { type: "text"; content: string }).content;
    expect(content).toContain("Unknown mode");
  });
});
