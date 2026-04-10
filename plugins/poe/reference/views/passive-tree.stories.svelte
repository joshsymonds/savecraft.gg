<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import PassiveTree from "./passive-tree.svelte";
  const { Story } = defineMeta({ title: "PoE/Views/PassiveTree", tags: ["autodocs"] });

  const iconUrl = "/plugins/poe/icon.png";

  const keystoneSearch = {
    icon_url: iconUrl,
    query: "mind over matter",
    results: [
      {
        id: 34098,
        name: "Mind Over Matter",
        type: "keystone",
        stats: ["30% of Damage is taken from Mana before Life"],
        allocated: true,
      },
    ],
  };

  const lifeSearch = {
    icon_url: iconUrl,
    query: "life",
    results: [
      {
        id: 18025,
        name: "Constitution",
        type: "notable",
        stats: ["+20 to maximum Life", "5% increased maximum Life"],
        allocated: true,
      },
      {
        id: 49308,
        name: "Purity of Flesh",
        type: "notable",
        stats: ["+25 to maximum Life", "15% increased maximum Life", "+20% to Chaos Resistance"],
        allocated: true,
      },
      {
        id: 7444,
        name: "Sanctum of Thought",
        type: "notable",
        stats: ["30% reduced Reflected Elemental Damage taken", "20% increased maximum Mana", "+20 to maximum Energy Shield"],
        allocated: false,
      },
      {
        id: 11150,
        name: "Devotion",
        type: "notable",
        stats: ["+20 to maximum Life", "10% increased maximum Life"],
        allocated: false,
      },
    ],
  };

  const suppressionSearch = {
    icon_url: iconUrl,
    query: "spell suppression",
    results: [
      {
        id: 22102,
        name: "Inveterate",
        type: "notable",
        stats: ["+10% chance to Suppress Spell Damage", "3% increased Attack and Cast Speed"],
        allocated: false,
      },
      {
        id: 33718,
        name: "Instinct",
        type: "notable",
        stats: ["+12% chance to Suppress Spell Damage", "+15 to Dexterity"],
        allocated: false,
      },
      {
        id: 44820,
        name: "Spell Suppression",
        type: "small",
        stats: ["+4% chance to Suppress Spell Damage"],
        allocated: false,
      },
      {
        id: 44821,
        name: "Spell Suppression",
        type: "small",
        stats: ["+4% chance to Suppress Spell Damage"],
        allocated: false,
      },
    ],
  };

  const emptySearch = {
    icon_url: iconUrl,
    query: "nonexistent node",
    results: [],
  };
</script>

<Story name="KeystoneSearch">
  <PassiveTree data={keystoneSearch} />
</Story>

<Story name="LifeNodeSearch">
  <PassiveTree data={lifeSearch} />
</Story>

<Story name="SuppressionSearch">
  <PassiveTree data={suppressionSearch} />
</Story>

<Story name="NoResults">
  <PassiveTree data={emptySearch} />
</Story>
