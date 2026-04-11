<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import Deckbuilding from "./deckbuilding.svelte";
  const { Story } = defineMeta({ title: "MTG/Views/Deckbuilding", tags: ["autodocs"] });

  const iconUrl = "/plugins/mtga/icon.png";

  const healthCheck = {
    icon_url: iconUrl,
    mode: "health_check",
    set: "MKM",
    archetype: "WB",
    sections: [
      { name: "Creature Count", status: "good", actual: 15, expected: "14-17", note: "On target for midrange" },
      { name: "Removal", status: "warning", actual: 2, expected: "3-5", note: "Light on removal — consider prioritizing in remaining packs" },
      { name: "Mana Curve", status: "issue", actual: "top-heavy", expected: "balanced", note: "Six 5+ mana cards is too many — cut at least two" },
      { name: "Card Quality", status: "good", actual: "3 bombs", expected: "1-2", note: "Above average bomb count" },
      { name: "Synergy", status: "good", actual: "high", expected: "moderate", note: "Strong sacrifice theme with 4 payoffs" },
    ],
    mana: { lands: 17, sources: { W: 9, B: 8 } },
    alternatives: [],
    unresolved_cards: [],
  };

  const cutAdvisor = {
    icon_url: iconUrl,
    mode: "cut_advisor",
    set: "MKM",
    archetype: "WB",
    cuts_requested: 3,
    candidates: [
      { card: "Granite Witness", score: 0.15, reason: "44.2% GIH WR — weakest card in pool, off-color splash not worth it" },
      { card: "Basilica Stalker", score: 0.28, reason: "Below-curve 3-drop, you already have 5 better options at this CMC" },
      { card: "Undercity Sewers", score: 0.35, reason: "Enters tapped — with 17 other lands you have sufficient color fixing" },
    ],
  };

  const constructed = {
    icon_url: iconUrl,
    mode: "constructed",
    format: "standard",
    total_cards: 60,
    composition: { creatures: 25, noncreatures: 11, lands: 24 },
    sideboard_count: 15,
    curve: [
      { cmc: 1, count: 8 },
      { cmc: 2, count: 11 },
      { cmc: 3, count: 4 },
      { cmc: 4, count: 4 },
      { cmc: 5, count: 7 },
      { cmc: 6, count: 2 },
    ],
    mana: {
      pip_distribution: { W: 18, U: 14 },
      colors: [
        { color: "W", color_name: "White", sources_needed: 16, sources_actual: 14, surplus: -2, status: "warning", most_demanding: "The Wandering Emperor", cost_pattern: "2WW", is_gold_adjusted: false },
        { color: "U", color_name: "Blue", sources_needed: 14, sources_actual: 15, surplus: 1, status: "good", most_demanding: "No More Lies", cost_pattern: "WU", is_gold_adjusted: true },
      ],
      swap_suggestions: [
        { cut: "Plains", add: "Azorius Chancery", reason: "Adds a Blue source while keeping White — closes the 2-source White deficit" },
      ],
    },
    unresolved_cards: [],
  };

  const constructedWithIssues = {
    icon_url: iconUrl,
    mode: "constructed",
    format: "standard",
    total_cards: 58,
    composition: { creatures: 20, noncreatures: 14, lands: 24 },
    sideboard_count: 12,
    illegal_cards: [
      { name: "Smuggler's Copter", status: "not_legal" },
    ],
    curve: [
      { cmc: 1, count: 6 },
      { cmc: 2, count: 10 },
      { cmc: 3, count: 8 },
      { cmc: 4, count: 6 },
      { cmc: 5, count: 4 },
    ],
    mana: {
      pip_distribution: { R: 22 },
      colors: [
        { color: "R", color_name: "Red", sources_needed: 18, sources_actual: 20, surplus: 2, status: "good", most_demanding: "Embercleave", cost_pattern: "4RR", is_gold_adjusted: false },
      ],
      swap_suggestions: [],
    },
    unresolved_cards: ["Totally Made Up Card"],
  };
</script>

<Story name="HealthCheck">
  <div style="width: 500px;">
    <Deckbuilding data={healthCheck} />
  </div>
</Story>

<Story name="CutAdvisor">
  <div style="width: 500px;">
    <Deckbuilding data={cutAdvisor} />
  </div>
</Story>

<Story name="Constructed">
  <div style="width: 500px;">
    <Deckbuilding data={constructed} />
  </div>
</Story>

<Story name="ConstructedWithIssues">
  <div style="width: 500px;">
    <Deckbuilding data={constructedWithIssues} />
  </div>
</Story>
