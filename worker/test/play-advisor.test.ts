import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  extractTurnsFromSection,
  playAdvisorModule,
} from "../../plugins/magic/reference/play-advisor";
import { registerNativeModule } from "../src/reference/registry";

import { cleanAll } from "./helpers";

// ── Real production v3b game/match section fixture ─────────────
//
// Copied from a genuine reporter export (match
// b7d8b134-b502-4909-a11e-c59b7f976c35, player seat 2, 8 real turns / 41 tn
// snapshots) to exercise extractTurnsFromSection against the actual v3b
// compressed shape the Go parser emits, not a hand-rolled approximation.
// See plugins/magic/parser/game_section_v3b.go for the shape's source of
// truth.

const REAL_MATCH_ID = "b7d8b134-b502-4909-a11e-c59b7f976c35";

const realGameSection = {
  cd: {
    "29970": "Flickerwisp",
    "36682": "Oust",
    "58415": "Polluted Delta",
    "71315": "Indatha Triome",
    "71320": "Savai Triome",
    "75024": "Mountain",
    "79417": "Command Tower",
    "79708": "Eiganjo, Seat of the Empire",
    "80401": "Jetmir's Garden",
    "86087": "Thraben Inspector",
    "90889": "Phelia, Exuberant Shepherd",
    "96179": "Plains",
    "97139": "Strip Mine",
    "97824": "Surris, Spidersilk Innovator",
    "97960": "Borys, the Spider Rider",
    "104847": "",
  },
  matchId: REAL_MATCH_ID,
  tn: [
    { ap: 0, pl: [{ l: 25, s: 2 }], t: 0 },
    {
      ap: 2,
      ph: "begin",
      pl: [
        { l: 25, s: 1 },
        { l: 25, s: 2 },
      ],
      t: 1,
    },
    {
      a: [{ move: { c: 80_401, mt: "play_land" }, p: 2 }],
      ap: 2,
      ph: "main1",
      t: 1,
    },
    { ap: 2, ph: "combat", t: 1 },
    { ap: 2, ph: "main2", t: 1 },
    { ap: 2, ph: "end", t: 1 },
    {
      ap: 1,
      ph: "begin",
      pl: [
        { l: 25, s: 1 },
        { l: 25, s: 2 },
      ],
      t: 2,
    },
    {
      a: [{ move: { c: 96_179, mt: "play_land" }, p: 1 }],
      ap: 1,
      ph: "main1",
      t: 2,
    },
    { ap: 1, ph: "combat", t: 2 },
    { ap: 1, ph: "main2", t: 2 },
    { ap: 1, ph: "end", t: 2 },
    {
      a: [
        { p: 2, tap: { c: 80_401, td: false } },
        { move: { c: 58_415, mt: "draw" }, p: 2 },
      ],
      ap: 2,
      ph: "begin",
      pl: [
        { l: 25, s: 1 },
        { l: 25, s: 2 },
      ],
      t: 3,
    },
    {
      a: [
        { move: { c: 79_417, mt: "play_land" }, p: 2 },
        {
          cast: {
            c: 97_824,
            m: [
              { k: "W", n: 1 },
              { k: "W", n: 1 },
            ],
          },
          p: 2,
        },
        { ability: { at: "triggered", c: 80_401 }, p: 2 },
        { p: 2, tap: { c: 80_401, td: true } },
        { ability: { at: "triggered", c: 79_417 }, p: 2 },
        { p: 2, tap: { c: 79_417, td: true } },
        { p: 2, resolve: { c: 97_824 } },
        { move: { c: 97_824, mt: "move" }, p: 2 },
        { ability: { at: "triggered", c: 97_824 }, p: 2 },
      ],
      ap: 2,
      ph: "main1",
      t: 3,
    },
    { ap: 2, ph: "combat", t: 3 },
    { ap: 2, ph: "main2", t: 3 },
    { ap: 2, ph: "end", t: 3 },
    { ap: 1, ph: "begin", pl: [{ l: 25, s: 1 }], t: 4 },
    {
      a: [{ move: { c: 79_708, mt: "play_land" }, p: 1 }],
      ap: 1,
      ph: "main1",
      t: 4,
    },
    { ap: 1, ph: "combat", t: 4 },
    { ap: 1, ph: "main2", t: 4 },
    { ap: 1, ph: "end", t: 4 },
    {
      a: [
        { p: 2, tap: { c: 80_401, td: false } },
        { p: 2, tap: { c: 79_417, td: false } },
        { move: { c: 71_320, mt: "draw" }, p: 2 },
      ],
      ap: 2,
      ph: "begin",
      pl: [
        { l: 25, s: 1 },
        { l: 25, s: 2 },
      ],
      t: 5,
    },
    {
      a: [{ move: { c: 75_024, mt: "play_land" }, p: 2 }],
      ap: 2,
      ph: "main1",
      t: 5,
    },
    {
      a: [
        { p: 2, tap: { c: 97_824, td: true } },
        { p: 2, tap: { c: 104_847, td: true } },
        {
          damage: {
            am: 0,
            ic: true,
            sid: 97_824,
            src: "Surris, Spidersilk Innovator",
            target: "player",
          },
          p: 2,
        },
        {
          damage: { am: 2, ic: true, sid: 104_847, src: "", target: "player" },
          p: 2,
        },
      ],
      ap: 2,
      ph: "combat",
      pl: [{ l: 23, s: 1 }],
      t: 5,
    },
    {
      a: [
        {
          cast: {
            c: 97_960,
            m: [
              { k: "R", n: 1 },
              { k: "G", n: 1 },
            ],
          },
          p: 2,
        },
        { p: 2, tap: { c: 75_024, td: true } },
        { ability: { at: "triggered", c: 80_401 }, p: 2 },
        { p: 2, tap: { c: 80_401, td: true } },
        { move: { c: 97_960, mt: "move" }, p: 2 },
        { p: 2, resolve: { c: 97_960 } },
        { move: { c: 97_960, mt: "move" }, p: 2 },
        { p: 2, statMod: { c: 97_960, pw: 2, tf: 2 } },
      ],
      ap: 2,
      ph: "main2",
      t: 5,
    },
    {
      a: [
        {
          cast: {
            c: 90_889,
            m: [
              { k: "W", n: 1 },
              { k: "W", n: 1 },
            ],
          },
          p: 1,
        },
        { p: 1, tap: { c: 96_179, td: true } },
        { ability: { at: "triggered", c: 79_708 }, p: 1 },
        { p: 1, tap: { c: 79_708, td: true } },
        { p: 1, resolve: { c: 90_889 } },
        { move: { c: 90_889, mt: "move" }, p: 1 },
      ],
      ap: 2,
      ph: "end",
      t: 5,
    },
    {
      a: [
        { p: 1, tap: { c: 96_179, td: false } },
        { p: 1, tap: { c: 79_708, td: false } },
      ],
      ap: 1,
      ph: "begin",
      pl: [
        { l: 23, s: 1 },
        { l: 25, s: 2 },
      ],
      t: 6,
    },
    {
      a: [
        { cast: { c: 36_682, m: [{ k: "W", n: 1 }] }, p: 1 },
        { p: 1, target: { tgs: ["Oust"] } },
        { p: 1, tap: { c: 96_179, td: true } },
        { move: { c: 36_682, mt: "put" }, p: 1 },
        { p: 1, resolve: { c: 36_682 } },
        { move: { c: 36_682, mt: "move" }, p: 1 },
        { move: { c: 97_139, mt: "play_land" }, p: 1 },
        { ability: { at: "triggered", c: 97_139 }, p: 1 },
        { p: 1, tap: { c: 97_139, td: true } },
        { move: { c: 97_139, mt: "move" }, p: 1 },
        { move: { c: 79_417, mt: "destroy" }, p: 2 },
        { cast: { c: 86_087, m: [{ k: "W", n: 1 }] }, p: 1 },
        { ability: { at: "triggered", c: 79_708 }, p: 1 },
        { p: 1, tap: { c: 79_708, td: true } },
        { p: 1, resolve: { c: 86_087 } },
        { move: { c: 86_087, mt: "move" }, p: 1 },
        { ability: { at: "triggered", c: 86_087 }, p: 1 },
      ],
      ap: 1,
      ph: "main1",
      pl: [
        {
          battlefield: [
            {
              c: 75_024,
              ct: ["CardType_Land"],
              st: ["SubType_Mountain"],
              tdb: true,
            },
            { c: 79_417, ct: ["CardType_Land"] },
            {
              c: 80_401,
              ct: ["CardType_Land"],
              st: ["SubType_Mountain", "SubType_Forest", "SubType_Plains"],
              tdb: true,
            },
            {
              c: 104_847,
              ct: ["CardType_Creature"],
              pw: 2,
              st: ["SubType_Spider"],
              tdb: true,
              tf: 1,
            },
          ],
          l: 28,
          s: 2,
        },
      ],
      t: 6,
    },
    {
      a: [
        { p: 1, tap: { c: 90_889, td: true } },
        { ability: { at: "triggered", c: 90_889 }, p: 1 },
        { move: { c: 86_087, mt: "exile" }, p: 1 },
        {
          damage: {
            am: 2,
            ic: true,
            sid: 90_889,
            src: "Phelia, Exuberant Shepherd",
            target: "player",
          },
          p: 1,
        },
      ],
      ap: 1,
      ph: "combat",
      pl: [{ l: 26, s: 2 }],
      t: 6,
    },
    { ap: 1, ph: "main2", t: 6 },
    {
      a: [
        { ability: { at: "triggered", c: 90_889 }, p: 1 },
        { move: { c: 86_087, mt: "move" }, p: 1 },
        { ability: { at: "triggered", c: 86_087 }, p: 1 },
        { p: 1, statMod: { c: 90_889, pw: 1, tf: 1 } },
      ],
      ap: 1,
      ph: "end",
      t: 6,
    },
    {
      a: [
        { p: 2, tap: { c: 80_401, td: false } },
        { p: 2, tap: { c: 104_847, td: false } },
        { p: 2, tap: { c: 75_024, td: false } },
        { move: { c: 71_315, mt: "draw" }, p: 2 },
      ],
      ap: 2,
      ph: "begin",
      pl: [
        { l: 23, s: 1 },
        { l: 26, s: 2 },
      ],
      t: 7,
    },
    {
      a: [
        { move: { c: 71_320, mt: "play_land" }, p: 2 },
        {
          cast: {
            c: 97_824,
            m: [
              { k: "R", n: 1 },
              { k: "W", n: 1 },
            ],
          },
          p: 2,
        },
        { p: 2, tap: { c: 75_024, td: true } },
        { ability: { at: "triggered", c: 80_401 }, p: 2 },
        { p: 2, tap: { c: 80_401, td: true } },
        { p: 2, resolve: { c: 97_824 } },
        { move: { c: 97_824, mt: "move" }, p: 2 },
        { ability: { at: "triggered", c: 97_824 }, p: 2 },
      ],
      ap: 2,
      ph: "main1",
      t: 7,
    },
    { ap: 2, ph: "combat", t: 7 },
    { ap: 2, ph: "main2", t: 7 },
    { ap: 2, ph: "end", t: 7 },
    {
      a: [
        { p: 1, tap: { c: 96_179, td: false } },
        { p: 1, tap: { c: 79_708, td: false } },
        { p: 1, tap: { c: 90_889, td: false } },
      ],
      ap: 1,
      ph: "begin",
      pl: [
        { l: 23, s: 1 },
        { l: 26, s: 2 },
      ],
      t: 8,
    },
    {
      a: [
        { move: { c: 96_179, mt: "play_land" }, p: 1 },
        {
          cast: {
            c: 29_970,
            m: [
              { k: "W", n: 1 },
              { k: "W", n: 1 },
              { k: "W", n: 1 },
            ],
          },
          p: 1,
        },
        { p: 1, tap: { c: 96_179, td: true } },
        { ability: { at: "triggered", c: 79_708 }, p: 1 },
        { p: 1, tap: { c: 79_708, td: true } },
        { p: 1, tap: { c: 96_179, td: true } },
        { p: 1, resolve: { c: 29_970 } },
        { move: { c: 29_970, mt: "move" }, p: 1 },
        { ability: { at: "triggered", c: 29_970 }, p: 1 },
      ],
      ap: 1,
      ph: "main1",
      t: 8,
    },
    {
      a: [
        { p: 1, tap: { c: 90_889, td: true } },
        { p: 1, tap: { c: 86_087, td: true } },
        { ability: { at: "triggered", c: 90_889 }, p: 1 },
        { move: { c: 29_970, mt: "exile" }, p: 1 },
        {
          damage: {
            am: 3,
            ic: true,
            sid: 90_889,
            src: "Phelia, Exuberant Shepherd",
            target: "player",
          },
          p: 1,
        },
        {
          damage: {
            am: 1,
            ic: true,
            sid: 86_087,
            src: "Thraben Inspector",
            target: "player",
          },
          p: 1,
        },
      ],
      ap: 1,
      ph: "combat",
      pl: [{ l: 22, s: 2 }],
      t: 8,
    },
    { ap: 1, ph: "main2", t: 8 },
    {
      a: [
        { ability: { at: "triggered", c: 29_970 }, p: 1 },
        { ability: { at: "triggered", c: 90_889 }, p: 1 },
      ],
      ap: 1,
      ph: "end",
      pl: [
        { l: 23, s: 1 },
        { l: 22, s: 2 },
      ],
      t: 8,
    },
  ],
};

const realMatchSection = {
  date: "2026-07-13T00:45:41Z",
  eventId: "Brawl_Ladder",
  games: [{ gameNumber: 1, winningSeat: 1 }],
  matchId: REAL_MATCH_ID,
  opponent: {
    cardsSeen: [
      { arenaId: 90_889, name: "Phelia, Exuberant Shepherd" },
      { arenaId: 96_179, name: "Plains" },
      { arenaId: 79_708, name: "Eiganjo, Seat of the Empire" },
      { arenaId: 36_682, name: "Oust" },
      { arenaId: 97_139, name: "Strip Mine" },
      { arenaId: 86_087, name: "Thraben Inspector" },
      { arenaId: 86_369, name: "" },
      { arenaId: 29_970, name: "Flickerwisp" },
    ],
    name: "WilmerVelches",
    seat: 1,
    userId: "YFDFDQOI7FERNABVL2D7Z2Z4X4",
  },
  player: {
    name: "Aure Silvershield",
    seat: 2,
    userId: "47BADBEB1045E08A",
  },
  result: "loss",
};

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
      `INSERT INTO magic_play_card_timing (set_code, card_name, archetype, turn_number, times_deployed, games_won, total_games)
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
      `INSERT INTO magic_play_tempo (set_code, archetype, turn_number, on_play, mana_spent_bucket, games_won, total_games)
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
      `INSERT INTO magic_play_combat (set_code, attacker_name, turn_number, user_creatures_count, oppo_creatures_count, attacked, games_won, total_games)
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
      `INSERT INTO magic_play_mulligan (set_code, archetype, on_play, land_count, nonland_cmc_bucket, num_mulligans, games_won, total_games)
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
      `INSERT INTO magic_play_turn_baselines (set_code, archetype, turn_number, on_play, total_mana_spent, total_creatures_cast, total_spells_cast, total_creatures_attacked, total_attacks_possible, games_won, total_games)
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
      `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, cmc, type_line, is_default, front_face_name)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    )
      .bind(
        `scry-pa-${String(c.id)}`,
        c.id,
        `oracle-${String(c.id)}`,
        c.name,
        c.cmc,
        c.type,
        c.name,
      )
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
    registerNativeModule("magic", playAdvisorModule);
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
      .bind(saveUuid, "user-play-test", "magic", "magic", "TestPlayer", "test")
      .run();

    const gameSection = JSON.stringify({
      cd: {
        "93757": "Kaito, Cunning Infiltrator",
        "93848": "Ajani's Pridemate",
        "93963": "Burnished Hart",
        "93965": "Gleaming Barrier",
        "95194": "Island",
      },
      matchId: "match-abc-123",
      tn: [
        {
          a: [{ move: { c: 95_194, mt: "play_land" }, p: 1 }],
          ap: 1,
          ph: "main1",
          t: 1,
        },
        {
          a: [
            { move: { c: 95_194, mt: "play_land" }, p: 1 },
            {
              cast: { c: 93_965, m: [{ k: "Colorless", n: 2 }] },
              p: 1,
            },
          ],
          ap: 1,
          ph: "main1",
          pl: [
            {
              battlefield: [{ c: 93_965, ct: ["CardType_Creature"], pw: 0, tf: 4 }],
              l: 20,
              s: 1,
            },
            { l: 20, s: 2 },
          ],
          t: 2,
        },
        {
          a: [
            { move: { c: 95_194, mt: "play_land" }, p: 1 },
            {
              cast: { c: 93_757, m: [{ k: "Blue", n: 3 }] },
              p: 1,
            },
          ],
          ap: 1,
          ph: "main1",
          pl: [
            {
              battlefield: [{ c: 93_965, ct: ["CardType_Creature"], pw: 0, tf: 4 }],
              l: 20,
              s: 1,
            },
            {
              battlefield: [
                { c: 93_848, ct: ["CardType_Creature"], pw: 2, tf: 2 },
                { c: 93_963, ct: ["CardType_Creature"], pw: 2, tf: 2 },
              ],
              l: 20,
              s: 2,
            },
          ],
          t: 3,
        },
      ],
    });

    const matchSection = JSON.stringify({
      matchId: "match-abc-123",
      opponent: { seat: 2 },
      player: { seat: 1 },
      result: "win",
    });

    await env.DB.prepare(
      "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
    )
      .bind(saveUuid, "game:match-abc-123", "Game log", gameSection)
      .run();

    await env.DB.prepare(
      "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
    )
      .bind(saveUuid, "match:match-abc-123", "Match summary", matchSection)
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
      .bind(saveUuid, "user-notfound", "magic", "magic", "TestPlayer", "test")
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

  // ── extractTurnsFromSection: v3b compressed shape ─────────────

  describe("extractTurnsFromSection (v3b)", () => {
    it("extracts real turn numbers from a v3b game section, aggregating per-phase snapshots", () => {
      const turns = extractTurnsFromSection(realGameSection, 2);
      // t=0 is the pre-game/mulligan snapshot, not a real turn; real turns
      // are 1 through 8 (the max in this fixture).
      expect(turns.map((t) => t.turn)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it("resolves cards_played names via the cd dictionary and sums mana_spent from cast.m", () => {
      const turns = extractTurnsFromSection(realGameSection, 2);
      const turn3 = turns.find((t) => t.turn === 3);
      expect(turn3).toBeDefined();
      expect(turn3!.mana_spent).toBe(2);
      expect(turn3!.cards_played).toEqual(["Command Tower", "Surris, Spidersilk Innovator"]);

      const turn7 = turns.find((t) => t.turn === 7);
      expect(turn7).toBeDefined();
      expect(turn7!.mana_spent).toBe(2);
      expect(turn7!.cards_played).toEqual(["Savai Triome", "Surris, Spidersilk Innovator"]);
    });

    it("excludes basic-land play_land moves from cards_played", () => {
      const turns = extractTurnsFromSection(realGameSection, 2);
      const turn5 = turns.find((t) => t.turn === 5);
      expect(turn5).toBeDefined();
      // Turn 5 plays a Mountain (basic, excluded) and casts Borys (included).
      expect(turn5!.cards_played).toEqual(["Borys, the Spider Rider"]);
    });

    it("never emits a blank card name for creatures_attacked, even when the cd/src name is empty", () => {
      const turns = extractTurnsFromSection(realGameSection, 2);
      const turn5 = turns.find((t) => t.turn === 5);
      expect(turn5).toBeDefined();
      // Turn 5 combat has two damage actions for seat 2: one with am=0
      // (excluded) and one with a blank src name (card 104847, cd[""]).
      // Neither should appear in creatures_attacked.
      expect(turn5!.creatures_attacked).toEqual([]);
      for (const turn of turns) {
        expect(turn.creatures_attacked).not.toContain("");
        expect(turn.cards_played).not.toContain("");
      }
    });

    it("extracts the correct player's actions by seat, not the opponent's", () => {
      const seat2Turns = extractTurnsFromSection(realGameSection, 2);
      const seat1Turns = extractTurnsFromSection(realGameSection, 1);

      const seat2Turn3 = seat2Turns.find((t) => t.turn === 3);
      const seat1Turn3 = seat1Turns.find((t) => t.turn === 3);
      // Turn 3's actions all belong to seat 2 (the reporter) in this real
      // fixture — seat 1 played nothing that turn.
      expect(seat2Turn3!.cards_played!.length).toBeGreaterThan(0);
      expect(seat1Turn3!.cards_played).toEqual([]);

      const seat2Turn8 = seat2Turns.find((t) => t.turn === 8);
      const seat1Turn8 = seat1Turns.find((t) => t.turn === 8);
      // Turn 8's actions all belong to seat 1 in this fixture.
      expect(seat1Turn8!.cards_played!.length).toBeGreaterThan(0);
      expect(seat2Turn8!.cards_played).toEqual([]);
    });

    it("derives user/oppo creature counts from pl[].battlefield entries, carrying forward across phase snapshots with no battlefield key", () => {
      const turns = extractTurnsFromSection(realGameSection, 2);
      const turn6 = turns.find((t) => t.turn === 6);
      expect(turn6).toBeDefined();
      // Turn 6 main1 gives seat 2 a battlefield snapshot with 1 creature
      // (card 104847) among 3 lands; the later combat sub-entry for turn 6
      // only carries a life-total change (no battlefield key) and must not
      // reset the count back to 0.
      expect(turn6!.user_creatures).toBe(1);
    });

    it("does not emit a card name resolved from a blank cd entry for cast or play_land moves", () => {
      const synthetic = {
        cd: { "1": "", "2": "Real Card" },
        matchId: "synthetic",
        tn: [
          {
            a: [
              { cast: { c: 1 }, p: 1 },
              { move: { c: 1, mt: "play_land" }, p: 1 },
              { cast: { c: 2 }, p: 1 },
            ],
            ap: 1,
            t: 1,
          },
        ],
      };
      const turns = extractTurnsFromSection(synthetic, 1);
      expect(turns[0]!.cards_played).toEqual(["Real Card"]);
    });
  });

  it("game_review resolves the player seat from the match section, not a hardcoded default", async () => {
    const saveUuid = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(saveUuid, "user-seat-test", "magic", "magic", "TestPlayer", "test")
      .run();

    await env.DB.prepare(
      "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
    )
      .bind(saveUuid, `game:${REAL_MATCH_ID}`, "Game log", JSON.stringify(realGameSection))
      .run();

    await env.DB.prepare(
      "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
    )
      .bind(saveUuid, `match:${REAL_MATCH_ID}`, "Match summary", JSON.stringify(realMatchSection))
      .run();

    // "Borys, the Spider Rider" is cast only by seat 2 (the reporter) in
    // this fixture. If loadTurnsFromMatchId still hardcoded playerSeat=1
    // instead of reading match.player.seat=2, Borys would never appear in
    // cards_played and coverage.found would be 0.
    await env.DB.prepare(
      `INSERT INTO magic_play_card_timing (set_code, card_name, archetype, turn_number, times_deployed, games_won, total_games)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind("FDN", "Borys, the Spider Rider", "ALL", 5, 10, 5, 10)
      .run();

    const result = await playAdvisorModule.execute(
      {
        mode: "game_review",
        set: "FDN",
        match_id: REAL_MATCH_ID,
        user_id: "user-seat-test",
      },
      env,
    );

    expect(result.type).toBe("structured");
    if (result.type !== "structured") throw new Error("unexpected type");
    const coverage = result.data.coverage as { found: number; total: number };
    expect(coverage.found).toBe(1);
  });

  it("includes the underlying parse error when the game section data is malformed", async () => {
    const saveUuid = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(saveUuid, "user-malformed", "magic", "magic", "TestPlayer", "test")
      .run();

    await env.DB.prepare(
      "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
    )
      .bind(saveUuid, "game:malformed-match", "Game log", "{not valid json")
      .run();

    const result = await playAdvisorModule.execute(
      {
        mode: "game_review",
        set: "FDN",
        match_id: "malformed-match",
        user_id: "user-malformed",
      },
      env,
    );

    const content = (result as { type: "text"; content: string }).content;
    expect(content).toContain("Failed to parse game section data for malformed-match");
    // The underlying JSON.parse error text must be included, not swallowed.
    expect(content).not.toBe("Error: Failed to parse game section data for malformed-match.");
  });

  it("includes the underlying parse error when the match section data is malformed, attributed to the match section", async () => {
    const saveUuid = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(saveUuid, "user-malformed-match", "magic", "magic", "TestPlayer", "test")
      .run();

    await env.DB.prepare(
      "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
    )
      .bind(saveUuid, `game:${REAL_MATCH_ID}`, "Game log", JSON.stringify(realGameSection))
      .run();

    await env.DB.prepare(
      "INSERT INTO sections (save_uuid, name, description, data) VALUES (?, ?, ?, ?)",
    )
      .bind(saveUuid, `match:${REAL_MATCH_ID}`, "Match summary", "{not valid json")
      .run();

    const result = await playAdvisorModule.execute(
      {
        mode: "game_review",
        set: "FDN",
        match_id: REAL_MATCH_ID,
        user_id: "user-malformed-match",
      },
      env,
    );

    const content = (result as { type: "text"; content: string }).content;
    expect(content).toContain(`Failed to parse match section data for ${REAL_MATCH_ID}`);
    expect(content).not.toContain("Failed to parse game section data");
  });
});
