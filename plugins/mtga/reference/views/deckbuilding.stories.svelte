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
    formatted_report: `Your Azorius Control list is well-positioned for the current meta. The core counter suite (Make Disappear, No More Lies, Dissolve) covers the early-to-mid game effectively, and The Wandering Emperor provides flexible interaction at instant speed.

Mana base looks solid at 26 lands with 4 Azorius Chancery. The Restless Anchorage pair gives you a win condition that dodges sorcery-speed removal.

Areas to watch: You're light on board wipes — only 2 Depopulate mainboard. Against aggressive creature decks (Boros Convoke, Mono-Red), consider going up to 3. The sideboard Temporary Lockdown helps but comes down a turn late against the fastest starts.

Card quality is high overall. Recommended swaps: cut 1 Impulse for a 3rd Depopulate, and consider Memory Deluge over the 2nd Dig Through Time to avoid graveyard dependency.`,
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
