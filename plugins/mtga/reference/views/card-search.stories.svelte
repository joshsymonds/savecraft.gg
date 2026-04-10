<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import CardSearch from "./card-search.svelte";
  const { Story } = defineMeta({ title: "MTG/Views/CardSearch", tags: ["autodocs"] });

  const iconUrl = "/plugins/mtga/icon.png";

  const bolt = {
    name: "Lightning Bolt",
    manaCost: "{R}",
    typeLine: "Instant",
    oracleText: "Lightning Bolt deals 3 damage to any target.",
    colors: ["R"],
    colorIdentity: ["R"],
    rarity: "common",
  };

  const sheoldred = {
    name: "Sheoldred, the Apocalypse",
    manaCost: "{2}{B}{B}",
    typeLine: "Legendary Creature — Phyrexian Praetor",
    oracleText: "Deathtouch\nWhenever you draw a card, you gain 2 life.\nWhenever an opponent draws a card, they lose 2 life.",
    colors: ["B"],
    colorIdentity: ["B"],
    rarity: "mythic",
    keywords: ["Deathtouch"],
    power: "4",
    toughness: "5",
  };

  const omnath = {
    name: "Omnath, Locus of Creation",
    manaCost: "{R}{G}{W}{U}",
    typeLine: "Legendary Creature — Elemental",
    oracleText: "When Omnath, Locus of Creation enters, draw a card.\nLandfall — Whenever a land you control enters, you gain 4 life. If this is the second time this ability has resolved this turn, add {R}{G}{W}{U}. If it's the third time, Omnath deals 4 damage to each opponent and each planeswalker you don't control.",
    colors: ["R", "G", "W", "U"],
    colorIdentity: ["R", "G", "W", "U"],
    rarity: "mythic",
    keywords: ["Landfall"],
    power: "4",
    toughness: "4",
  };

  const goForTheThroat = {
    name: "Go for the Throat",
    manaCost: "{1}{B}",
    typeLine: "Instant",
    oracleText: "Destroy target nonartifact creature.",
    colors: ["B"],
    colorIdentity: ["B"],
    rarity: "uncommon",
  };

  const forest = {
    name: "Forest",
    manaCost: "",
    typeLine: "Basic Land — Forest",
    colors: [],
    colorIdentity: ["G"],
    rarity: "common",
  };
</script>

<Story name="MultipleCards">
  <div style="width: 800px;">
    <CardSearch data={{ cards: [bolt, sheoldred, omnath, goForTheThroat, forest], total: 5, icon_url: iconUrl }} />
  </div>
</Story>

<Story name="SingleCard">
  <div style="width: 800px;">
    <CardSearch data={{ cards: [sheoldred], total: 1, icon_url: iconUrl }} />
  </div>
</Story>

<Story name="Empty">
  <div style="width: 800px;">
    <CardSearch data={{ cards: [], total: 0 }} />
  </div>
</Story>
