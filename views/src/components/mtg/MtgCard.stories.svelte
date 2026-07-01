<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import MtgCard from "./MtgCard.svelte";
  const { Story } = defineMeta({ title: "MTG/Components/MtgCard", tags: ["autodocs"] });

  const bolt = {
    name: "Lightning Bolt",
    manaCost: "{R}",
    typeLine: "Instant",
    oracleText: "Lightning Bolt deals 3 damage to any target.",
    colors: ["R"],
    colorIdentity: ["R"],
    rarity: "common",
    scryfallId: "77c6fa74-5543-42ac-9ead-0e890b188e99",
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
    scryfallId: "d67be074-cdd4-41d9-ac89-0a0456c4e4b2",
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
    scryfallId: "4e4fb50c-a81f-44d3-93c5-fa9a0b37f617",
  };

  const forest = {
    name: "Forest",
    manaCost: "",
    typeLine: "Basic Land — Forest",
    colors: [],
    colorIdentity: ["G"],
    rarity: "common",
    scryfallId: "22463284-2478-4b1e-9a37-6dd2383266cf",
  };

  const iconUrl = "/plugins/magic/icon.png";

  const goForTheThroat = {
    name: "Go for the Throat",
    manaCost: "{1}{B}",
    typeLine: "Instant",
    oracleText: "Destroy target nonartifact creature.",
    colors: ["B"],
    colorIdentity: ["B"],
    rarity: "uncommon",
    scryfallId: "5446e1ba-c745-45b2-ad05-b22abf04daec",
  };
</script>

<Story name="MonoRed">
  <div style="width: 300px;">
    <MtgCard card={bolt} {iconUrl} />
  </div>
</Story>

<Story name="Mythic">
  <div style="width: 300px;">
    <MtgCard card={sheoldred} {iconUrl} />
  </div>
</Story>

<Story name="FourColor">
  <div style="width: 300px;">
    <MtgCard card={omnath} {iconUrl} />
  </div>
</Story>

<Story name="Land">
  <div style="width: 300px;">
    <MtgCard card={forest} {iconUrl} />
  </div>
</Story>

<Story name="Uncommon">
  <div style="width: 300px;">
    <MtgCard card={goForTheThroat} {iconUrl} />
  </div>
</Story>

<Story name="CardGallery">
  <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; width: 800px;">
    <MtgCard card={bolt} {iconUrl} />
    <MtgCard card={sheoldred} {iconUrl} />
    <MtgCard card={omnath} {iconUrl} />
    <MtgCard card={goForTheThroat} {iconUrl} />
    <MtgCard card={forest} {iconUrl} />
  </div>
</Story>
