<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import DraftAdvisor from "./draft-advisor.svelte";
  const { Story } = defineMeta({ title: "MTG/Views/DraftAdvisor", tags: ["autodocs"] });

  const axis = (raw, norm, weight, extra = {}) => ({
    raw, normalized: norm, weight, contribution: +(weight * norm).toFixed(4), ...extra,
  });

  const makeRec = (card, score, rank, overrides = {}) => ({
    card,
    composite_score: score,
    rank,
    axes: {
      baseline: axis(0.55, 0.7, 0.3, { gihwr: 55.0, source: "archetype" }),
      synergy: axis(0.2, 0.5, 0.15, { top_synergies: [{ card: "Virtue of Persistence", delta: 0.03 }] }),
      role: axis(0.3, 0.6, 0.1, { roles: ["removal"], detail: "premium removal" }),
      curve: axis(0.4, 0.8, 0.1, { cmc: 2, pool_at_cmc: 3, ideal_at_cmc: 4 }),
      castability: axis(0.9, 0.9, 0.1, { max_pips: 1, estimated_sources: 7, potential_sources: 8, effective_sources: 7.5, source_model: "current", bomb_dampening: 0 }),
      signal: axis(0.3, 0.5, 0.1, { ata: 4.5, current_pick: 3 }),
      color_commitment: axis(0.8, 0.8, 0.1, { color_fit: 0.8 }),
      opportunity_cost: axis(0.1, 0.3, 0.05),
      ...overrides,
    },
    waspas: { wsm: score - 0.02, wpm: score - 0.05, lambda: 0.5 },
  });

  const iconUrl = "/plugins/magic/icon.png";

  const data = {
    icon_url: iconUrl,
    archetype: {
      primary: "WB",
      candidates: [
        { archetype: "WB", weight: 0.85, deck_count: 1200, deck_share: 0.12, viability: "staple", format_context: "above average" },
        { archetype: "UB", weight: 0.45, deck_count: 800, deck_share: 0.08, viability: "viable", format_context: "average" },
        { archetype: "WU", weight: 0.2, deck_count: 400, deck_share: 0.04, viability: "fringe", format_context: "below average" },
      ],
      confidence: 0.85,
    },
    pick_number: 5,
    recommendations: [
      makeRec("Go for the Throat", 0.82, 1),
      makeRec("Preacher of the Schism", 0.74, 2, {
        baseline: axis(0.58, 0.75, 0.3, { gihwr: 58.0, source: "archetype" }),
        synergy: axis(0.35, 0.7, 0.15, { top_synergies: [{ card: "Sheoldred", delta: 0.05 }] }),
      }),
      makeRec("Hopeless Nightmare", 0.61, 3, {
        baseline: axis(0.52, 0.55, 0.3, { gihwr: 52.0, source: "overall" }),
      }),
      makeRec("Plains", 0.12, 4, {
        baseline: axis(0.48, 0.1, 0.3, { gihwr: 48.0, source: "overall" }),
        castability: axis(1.0, 1.0, 0.1, { max_pips: 0, estimated_sources: 8, potential_sources: 8, effective_sources: 8, source_model: "current", bomb_dampening: 0 }),
      }),
    ],
  };
</script>

<Story name="PickRecommendations">
  <div style="width: 600px;">
    <DraftAdvisor {data} />
  </div>
</Story>

<Story name="BatchReview">
  {@const batchData = {
    icon_url: iconUrl,
    summary: {
      total_picks: 42,
      optimal: 20,
      good: 12,
      questionable: 5,
      misses: 5,
      score: "20/42 optimal, 12 good, 5 questionable, 5 misses",
      archetype_warnings: ["WB: drift from WU to WB between picks 8-12"],
    },
    picks: [
      { pick_number: 1, pack_number: 1, pick_in_pack: 1, display_label: "P1P1", chosen: "Go for the Throat", chosen_rank: 1, chosen_composite: 0.82, recommended: "Go for the Throat", recommended_composite: 0.82, classification: "optimal", archetype_snapshot: { primary: "_overall", confidence: 0, viability: "fringe", phase: "exploration" } },
      { pick_number: 2, pack_number: 1, pick_in_pack: 2, display_label: "P1P2", chosen: "Sheoldred, the Apocalypse", chosen_rank: 1, chosen_composite: 0.91, recommended: "Sheoldred, the Apocalypse", recommended_composite: 0.91, classification: "optimal", archetype_snapshot: { primary: "WB", confidence: 0.4, viability: "staple", phase: "exploration" } },
      { pick_number: 3, pack_number: 1, pick_in_pack: 3, display_label: "P1P3", chosen: "Plains", chosen_rank: 5, chosen_composite: 0.15, recommended: "Virtue of Persistence", recommended_composite: 0.75, classification: "miss", archetype_snapshot: { primary: "WB", confidence: 0.5, viability: "staple", phase: "exploration" } },
      { pick_number: 4, pack_number: 1, pick_in_pack: 4, display_label: "P1P4", chosen: "Cut Down", chosen_rank: 1, chosen_composite: 0.7, recommended: "Cut Down", recommended_composite: 0.7, classification: "optimal", archetype_snapshot: { primary: "WB", confidence: 0.6, viability: "staple", phase: "exploration" } },
      { pick_number: 5, pack_number: 1, pick_in_pack: 5, display_label: "P1P5", chosen: "Hopeless Nightmare", chosen_rank: 2, chosen_composite: 0.55, recommended: "Deep-Cavern Bat", recommended_composite: 0.6, classification: "good", archetype_snapshot: { primary: "WB", confidence: 0.65, viability: "staple", phase: "exploration" } },
      { pick_number: 6, pack_number: 1, pick_in_pack: 6, display_label: "P1P6", chosen: "Swamp", chosen_rank: 4, chosen_composite: 0.2, recommended: "Preacher of the Schism", recommended_composite: 0.65, classification: "miss", archetype_snapshot: { primary: "WB", confidence: 0.7, viability: "staple", phase: "exploration" } },
      { pick_number: 7, pack_number: 1, pick_in_pack: 7, display_label: "P1P7", chosen: "Basement Torturer", chosen_rank: 1, chosen_composite: 0.5, recommended: "Basement Torturer", recommended_composite: 0.5, classification: "optimal", archetype_snapshot: { primary: "WB", confidence: 0.72, viability: "staple", phase: "exploration" } },
      { pick_number: 8, pack_number: 1, pick_in_pack: 8, display_label: "P1P8", chosen: "Spirited Companion", chosen_rank: 3, chosen_composite: 0.4, recommended: "Anointed Peacekeeper", recommended_composite: 0.52, classification: "questionable", archetype_snapshot: { primary: "WB", confidence: 0.75, viability: "staple", phase: "emerging" } },
      { pick_number: 9, pack_number: 1, pick_in_pack: 9, display_label: "P1P9", chosen: "Archangel of Wrath", chosen_rank: 1, chosen_composite: 0.48, recommended: "Archangel of Wrath", recommended_composite: 0.48, classification: "optimal", archetype_snapshot: { primary: "WB", confidence: 0.78, viability: "staple", phase: "emerging" } },
      { pick_number: 10, pack_number: 1, pick_in_pack: 10, display_label: "P1P10", chosen: "Destroy Evil", chosen_rank: 2, chosen_composite: 0.42, recommended: "Temporary Lockdown", recommended_composite: 0.45, classification: "good", archetype_snapshot: { primary: "WB", confidence: 0.8, viability: "staple", phase: "emerging" } },
      { pick_number: 11, pack_number: 1, pick_in_pack: 11, display_label: "P1P11", chosen: "Duress", chosen_rank: 1, chosen_composite: 0.38, recommended: "Duress", recommended_composite: 0.38, classification: "optimal", archetype_snapshot: { primary: "WB", confidence: 0.82, viability: "staple", phase: "emerging" } },
      { pick_number: 12, pack_number: 1, pick_in_pack: 12, display_label: "P1P12", chosen: "Swamp", chosen_rank: 1, chosen_composite: 0.2, recommended: "Swamp", recommended_composite: 0.2, classification: "optimal", archetype_snapshot: { primary: "WB", confidence: 0.82, viability: "staple", phase: "emerging" } },
      { pick_number: 13, pack_number: 1, pick_in_pack: 13, display_label: "P1P13", chosen: "Plains", chosen_rank: 1, chosen_composite: 0.15, recommended: "Plains", recommended_composite: 0.15, classification: "optimal", archetype_snapshot: { primary: "WB", confidence: 0.82, viability: "staple", phase: "committed" } },
      { pick_number: 14, pack_number: 1, pick_in_pack: 14, display_label: "P1P14", chosen: "Island", chosen_rank: 1, chosen_composite: 0.1, recommended: "Island", recommended_composite: 0.1, classification: "optimal", archetype_snapshot: { primary: "WB", confidence: 0.82, viability: "staple", phase: "committed" } },
      { pick_number: 15, pack_number: 2, pick_in_pack: 1, display_label: "P2P1", chosen: "Virtue of Persistence", chosen_rank: 1, chosen_composite: 0.88, recommended: "Virtue of Persistence", recommended_composite: 0.88, classification: "optimal", archetype_snapshot: { primary: "WB", confidence: 0.85, viability: "staple", phase: "committed" } },
      { pick_number: 16, pack_number: 2, pick_in_pack: 2, display_label: "P2P2", chosen: "Deep-Cavern Bat", chosen_rank: 1, chosen_composite: 0.72, recommended: "Deep-Cavern Bat", recommended_composite: 0.72, classification: "optimal", archetype_snapshot: { primary: "WB", confidence: 0.85, viability: "staple", phase: "committed" } },
      { pick_number: 17, pack_number: 2, pick_in_pack: 3, display_label: "P2P3", chosen: "Forest", chosen_rank: 6, chosen_composite: 0.1, recommended: "Anointed Peacekeeper", recommended_composite: 0.6, classification: "miss", archetype_snapshot: { primary: "WB", confidence: 0.85, viability: "staple", phase: "committed" } },
      { pick_number: 18, pack_number: 2, pick_in_pack: 4, display_label: "P2P4", chosen: "Wedding Announcement", chosen_rank: 2, chosen_composite: 0.65, recommended: "Raffine", recommended_composite: 0.7, classification: "good", archetype_snapshot: { primary: "WB", confidence: 0.85, viability: "staple", phase: "committed" } },
      { pick_number: 19, pack_number: 2, pick_in_pack: 5, display_label: "P2P5", chosen: "Ossification", chosen_rank: 3, chosen_composite: 0.52, recommended: "Vanishing Verse", recommended_composite: 0.58, classification: "questionable", archetype_snapshot: { primary: "WB", confidence: 0.85, viability: "staple", phase: "committed" } },
    ],
  }}
  <div style="width: 600px;">
    <DraftAdvisor data={batchData} />
  </div>
</Story>
