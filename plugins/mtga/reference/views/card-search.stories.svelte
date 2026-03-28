<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import CardSearch from "./card-search.svelte";

  const { Story } = defineMeta({
    title: "Reference/CardSearch",
    tags: ["autodocs"],
  });
</script>

<Story name="MultipleCards">
  <div style="max-width: 800px;">
    <CardSearch
      data={{
        cards: [
          {
            name: "Sheoldred, the Apocalypse",
            manaCost: "{2}{B}{B}",
            typeLine: "Legendary Creature — Phyrexian Praetor",
            oracleText: "Deathtouch\nWhenever you draw a card, you gain 2 life.\nWhenever an opponent draws a card, they lose 2 life.",
            rarity: "mythic",
          },
          {
            name: "Go for the Throat",
            manaCost: "{1}{B}",
            typeLine: "Instant",
            oracleText: "Destroy target nonartifact creature.",
            rarity: "uncommon",
          },
          {
            name: "Preacher of the Schism",
            manaCost: "{2}{B}",
            typeLine: "Creature — Vampire Cleric",
            oracleText: "Deathtouch\nWhenever Preacher of the Schism attacks, you may pay 2 life. If you do, discover 3.",
            rarity: "rare",
          },
        ],
        total: 3,
      }}
    />
  </div>
</Story>

<Story name="SingleCard">
  <div style="max-width: 400px;">
    <CardSearch
      data={{
        cards: [
          {
            name: "Lightning Bolt",
            manaCost: "{R}",
            typeLine: "Instant",
            oracleText: "Lightning Bolt deals 3 damage to any target.",
            rarity: "common",
          },
        ],
        total: 1,
      }}
    />
  </div>
</Story>
