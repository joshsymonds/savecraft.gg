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

  const iconUrl = "/plugins/mtga/icon.png";

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
