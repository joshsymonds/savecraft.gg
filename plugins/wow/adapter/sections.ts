/**
 * Section mappers: transform typed Blizzard/Raider.io API responses
 * into GameState sections for AI consumption.
 *
 * Each mapper is a pure function — no HTTP, no side effects.
 * Raider.io enrichment is optional; when absent, enrichment status
 * is set to unavailable but the section still returns primary data.
 */

import type {
  EnrichmentStatus,
  GameStateSection,
} from "../../../worker/src/adapters/adapter";
import type {
  BlizzardEquipment,
  BlizzardEquipmentItem,
  BlizzardMythicKeystoneSeason,
  BlizzardProfessions,
  BlizzardProfile,
  BlizzardRaids,
  BlizzardSpecializations,
  BlizzardStatistics,
  RaiderioProfile,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function raiderioEnrichment(
  raiderio: RaiderioProfile | undefined,
): EnrichmentStatus {
  return raiderio
    ? {
        source: "raiderio",
        available: true,
        crawledAt: raiderio.last_crawled_at,
      }
    : {
        source: "raiderio",
        available: false,
        unavailableReason: "Raider.io data not available",
      };
}

// ---------------------------------------------------------------------------
// 1. Character Overview
// ---------------------------------------------------------------------------

export function mapCharacterOverview(
  profile: BlizzardProfile,
  raiderio?: RaiderioProfile,
): GameStateSection {
  const data: Record<string, unknown> = {
    name: profile.name,
    level: profile.level,
    race: profile.race.name,
    class: profile.character_class.name,
    active_spec: profile.active_spec.name,
    faction: profile.faction.name,
    gender: profile.gender.name,
    realm: profile.realm.name,
    realm_slug: profile.realm.slug,
    character_id: profile.id,
    guild: profile.guild?.name ?? null,
    guild_realm: profile.guild?.realm.name ?? null,
    achievement_points: profile.achievement_points,
    average_item_level: profile.average_item_level,
    equipped_item_level: profile.equipped_item_level,
    active_title: profile.active_title?.display_string ?? null,
    last_login: profile.last_login_timestamp
      ? new Date(profile.last_login_timestamp).toISOString()
      : null,
    sections: [
      {
        name: "equipped_gear",
        hint: "All equipped items with ilvl, stats, enchants, gems, set bonuses",
      },
      {
        name: "character_stats",
        hint: "Primary/secondary/tertiary stats, attack/spell power, armor, defenses",
      },
      {
        name: "talents",
        hint: "Active talent build: class, spec, hero, and PvP talents with loadout code",
      },
      {
        name: "mythic_plus",
        hint: "M+ best runs, keystone levels, ratings, Raider.io scores",
      },
      {
        name: "raid_progression",
        hint: "Boss kills by difficulty across all expansions",
      },
      {
        name: "professions",
        hint: "Primary and secondary professions with skill points and recipe counts",
      },
    ],
  };

  if (raiderio) {
    const currentSeason = raiderio.mythic_plus_scores_by_season[0];
    data.raiderio_score = currentSeason?.scores.all ?? 0;
    data.raiderio_dps_score = currentSeason?.scores.dps ?? 0;
    data.raiderio_url = raiderio.profile_url;
  }

  return {
    description:
      "Character identity, gear score, and section index — start here to understand who this character is and which sections to fetch next",
    data,
    enrichment: [raiderioEnrichment(raiderio)],
  };
}

// ---------------------------------------------------------------------------
// 2. Equipped Gear
// ---------------------------------------------------------------------------

function mapItem(item: BlizzardEquipmentItem) {
  return {
    slot: item.slot.name,
    name: item.name,
    item_level: item.level.value,
    quality: item.quality.name,
    item_class: item.item_class.name,
    item_subclass: item.item_subclass.name,
    stats:
      item.stats
        ?.filter((s) => !s.is_negated)
        .map((s) => ({
          type: s.type.name,
          value: s.value,
        })) ?? [],
    enchantments:
      item.enchantments?.map((e) => ({
        description: e.display_string,
        source: e.source_item?.name ?? null,
      })) ?? [],
    sockets:
      item.sockets?.map((s) => ({
        gem: s.item?.name ?? "Empty",
        effect: s.display_string,
      })) ?? [],
    set_bonus: item.set?.display_string ?? null,
  };
}

export function mapEquippedGear(
  equipment: BlizzardEquipment,
): GameStateSection {
  return {
    description:
      "All equipped items with item level, stats, enchantments, gems, and set bonuses — fetch to evaluate gear upgrades, find missing enchants/gems, or check set bonus status",
    data: {
      items: equipment.equipped_items.map(mapItem),
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Character Stats
// ---------------------------------------------------------------------------

export function mapCharacterStats(
  statistics: BlizzardStatistics,
): GameStateSection {
  return {
    description:
      "Combat statistics: primary stats, secondary ratings, attack/spell power, armor, and defenses — fetch to analyze stat priorities, check breakpoints, or compare gear trade-offs",
    data: {
      health: statistics.health,
      power: statistics.power,
      power_type: statistics.power_type.name,
      primary: {
        strength: statistics.strength.effective,
        agility: statistics.agility.effective,
        intellect: statistics.intellect.effective,
        stamina: statistics.stamina.effective,
      },
      secondary: {
        crit: {
          rating: statistics.melee_crit.rating_normalized,
          percent: statistics.melee_crit.value,
        },
        haste: {
          rating: statistics.melee_haste.rating_normalized,
          percent: statistics.melee_haste.value,
        },
        mastery: {
          rating: statistics.mastery.rating_normalized,
          percent: statistics.mastery.value,
        },
        versatility: {
          rating: statistics.versatility,
          damage_percent: statistics.versatility_damage_done_bonus,
          damage_reduction_percent: statistics.versatility_damage_taken_bonus,
        },
      },
      tertiary: {
        speed: statistics.speed.rating_normalized,
        leech: statistics.lifesteal.rating_normalized,
        avoidance: statistics.avoidance.rating_normalized,
      },
      offense: {
        attack_power: statistics.attack_power,
        spell_power: statistics.spell_power,
        main_hand_dps: statistics.main_hand_dps,
        off_hand_dps: statistics.off_hand_dps,
      },
      defense: {
        armor: statistics.armor.effective,
        dodge_percent: statistics.dodge.value,
        parry_percent: statistics.parry.value,
        block_percent: statistics.block.value,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Talents
// ---------------------------------------------------------------------------

export function mapTalents(
  specializations: BlizzardSpecializations,
): GameStateSection {
  const activeSpec = specializations.specializations.find((s) =>
    s.loadouts.some((l) => l.is_active),
  );
  const activeLoadout = activeSpec?.loadouts.find((l) => l.is_active);

  const classTalents =
    activeLoadout?.selected_class_talents
      .filter((t) => t.tooltip)
      .map((t) => ({
        name: t.tooltip!.talent.name,
        rank: t.rank,
      })) ?? [];

  const specTalents =
    activeLoadout?.selected_spec_talents
      .filter((t) => t.tooltip)
      .map((t) => ({
        name: t.tooltip!.talent.name,
        rank: t.rank,
      })) ?? [];

  const heroTalents =
    activeLoadout?.selected_hero_talents
      ?.filter((t) => t.tooltip)
      .map((t) => ({
        name: t.tooltip!.talent.name,
        rank: t.rank,
      })) ?? [];

  const pvpTalents =
    activeSpec?.pvp_talent_slots?.map((slot) => ({
      name: slot.selected.talent.name,
      description: slot.selected.spell_tooltip.description,
      slot: slot.slot_number,
    })) ?? [];

  return {
    description:
      "Active talent build with class, spec, hero, and PvP talents plus loadout import code — fetch to review build choices, suggest talent swaps, or export the build",
    data: {
      spec_name: activeSpec?.specialization.name ?? null,
      loadout_code: activeLoadout?.talent_loadout_code ?? null,
      class_talents: classTalents,
      spec_talents: specTalents,
      hero_talents: heroTalents,
      pvp_talents: pvpTalents,
    },
  };
}

// ---------------------------------------------------------------------------
// 5. Mythic Plus
// ---------------------------------------------------------------------------

export function mapMythicPlus(
  keystoneSeason?: BlizzardMythicKeystoneSeason,
  raiderio?: RaiderioProfile,
): GameStateSection {
  const bestRuns =
    keystoneSeason?.best_runs.map((run) => ({
      dungeon: run.dungeon.name,
      keystone_level: run.keystone_level,
      completed_in_time: run.is_completed_within_time,
      duration_ms: run.duration,
      rating: run.mythic_rating.rating,
      affixes: run.keystone_affixes.map((a) => a.name),
      completed_at: new Date(run.completed_timestamp).toISOString(),
    })) ?? [];

  const data: Record<string, unknown> = {
    best_runs: bestRuns,
  };

  if (raiderio) {
    const currentSeason = raiderio.mythic_plus_scores_by_season[0];
    data.raiderio_score = currentSeason?.scores.all ?? 0;
    data.raiderio_scores_by_role = currentSeason
      ? {
          dps: currentSeason.scores.dps,
          healer: currentSeason.scores.healer,
          tank: currentSeason.scores.tank,
        }
      : null;
    data.raiderio_best_runs =
      raiderio.mythic_plus_best_runs.map((run) => ({
        dungeon: run.dungeon,
        short_name: run.short_name,
        level: run.mythic_level,
        score: run.score,
        upgrades: run.num_keystone_upgrades,
        completed_at: run.completed_at,
        url: run.url,
      })) ?? [];
    data.raiderio_recent_runs =
      raiderio.mythic_plus_recent_runs.map((run) => ({
        dungeon: run.dungeon,
        short_name: run.short_name,
        level: run.mythic_level,
        score: run.score,
        upgrades: run.num_keystone_upgrades,
        completed_at: run.completed_at,
      })) ?? [];
  }

  return {
    description:
      "Mythic+ dungeon performance: best runs, keystone levels, ratings, and Raider.io scores — fetch to evaluate M+ progress, identify weak dungeons, or plan key pushes",
    data,
    enrichment: [raiderioEnrichment(raiderio)],
  };
}

// ---------------------------------------------------------------------------
// 6. Raid Progression
// ---------------------------------------------------------------------------

export function mapRaidProgression(
  raids: BlizzardRaids,
  raiderio?: RaiderioProfile,
): GameStateSection {
  // Show all expansions/instances, most recent first
  const expansions = [...raids.expansions].reverse().map((exp) => ({
    expansion: exp.expansion.name,
    instances: exp.instances.map((inst) => ({
      name: inst.instance.name,
      modes: inst.modes.map((mode) => ({
        difficulty: mode.difficulty.name,
        status: mode.status.name,
        bosses_killed: mode.progress.completed_count,
        total_bosses: mode.progress.total_count,
      })),
    })),
  }));

  const data: Record<string, unknown> = {
    expansions,
  };

  if (raiderio?.raid_progression) {
    data.raiderio_progression = Object.entries(raiderio.raid_progression).map(
      ([slug, prog]) => ({
        raid: slug,
        summary: prog.summary,
        total_bosses: prog.total_bosses,
        normal_killed: prog.normal_bosses_killed,
        heroic_killed: prog.heroic_bosses_killed,
        mythic_killed: prog.mythic_bosses_killed,
      }),
    );
  }

  return {
    description:
      "Raid boss kills by difficulty across all expansions — fetch to check progression, identify undefeated bosses, or review current tier status",
    data,
    enrichment: [raiderioEnrichment(raiderio)],
  };
}

// ---------------------------------------------------------------------------
// 7. Professions
// ---------------------------------------------------------------------------

export function mapProfessions(
  professions: BlizzardProfessions,
): GameStateSection {
  const mapProf = (profs: BlizzardProfessions["primaries"]) =>
    (profs ?? []).map((p) => ({
      name: p.profession.name,
      tiers: (p.tiers ?? []).map((t) => ({
        name: t.tier.name,
        skill_points: t.skill_points,
        max_skill_points: t.max_skill_points,
        recipes_known: t.known_recipes?.length ?? 0,
      })),
    }));

  return {
    description:
      "Primary and secondary professions with skill points per expansion tier and recipe counts — fetch to check crafting progress or identify unleveled professions",
    data: {
      primaries: mapProf(professions.primaries),
      secondaries: mapProf(professions.secondaries),
    },
  };
}
