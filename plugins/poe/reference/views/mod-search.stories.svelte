<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import ModSearch from "./mod-search.svelte";
  const { Story } = defineMeta({ title: "PoE/Views/ModSearch", tags: ["autodocs"] });

  const iconUrl = "/plugins/poe/icon.png";

  /** Physical damage prefix — multiple tiers on axes */
  const physDmgMod = {
    mod_name: "% increased Physical Damage",
    generation_type: "prefix",
    domain: "item",
    tiers: [
      { tier: 1, name: "Tyrannical", level: 73, stats: [{ text: "+170% to 179% increased Physical Damage", min: 170, max: 179 }], weight: 50 },
      { tier: 2, name: "Merciless", level: 60, stats: [{ text: "+155% to 169% increased Physical Damage", min: 155, max: 169 }], weight: 100 },
      { tier: 3, name: "Dictator's", level: 46, stats: [{ text: "+135% to 154% increased Physical Damage", min: 135, max: 154 }], weight: 200 },
      { tier: 4, name: "Emperor's", level: 35, stats: [{ text: "+110% to 134% increased Physical Damage", min: 110, max: 134 }], weight: 300 },
      { tier: 5, name: "Conqueror's", level: 23, stats: [{ text: "+85% to 109% increased Physical Damage", min: 85, max: 109 }], weight: 500 },
    ],
  };

  /** Fire resistance suffix */
  const fireResMod = {
    mod_name: "% to Fire Resistance",
    generation_type: "suffix",
    domain: "item",
    tiers: [
      { tier: 1, name: "of Tzteosh", level: 72, stats: [{ text: "+46% to 48% to Fire Resistance", min: 46, max: 48 }], weight: 50 },
      { tier: 2, name: "of the Magma", level: 60, stats: [{ text: "+36% to 41% to Fire Resistance", min: 36, max: 41 }], weight: 100 },
      { tier: 3, name: "of the Volcano", level: 48, stats: [{ text: "+30% to 35% to Fire Resistance", min: 30, max: 35 }], weight: 200 },
      { tier: 4, name: "of the Furnace", level: 36, stats: [{ text: "+24% to 29% to Fire Resistance", min: 24, max: 29 }], weight: 300 },
    ],
  };

  /** Maximum life prefix */
  const lifeMod = {
    mod_name: "to maximum Life",
    generation_type: "prefix",
    domain: "item",
    tiers: [
      { tier: 1, name: "Peerless", level: 80, stats: [{ text: "+110 to 119 to maximum Life", min: 110, max: 119 }], weight: 25 },
      { tier: 2, name: "Prime", level: 64, stats: [{ text: "+90 to 99 to maximum Life", min: 90, max: 99 }], weight: 50 },
      { tier: 3, name: "Vigorous", level: 54, stats: [{ text: "+80 to 89 to maximum Life", min: 80, max: 89 }], weight: 100 },
      { tier: 4, name: "Robust", level: 44, stats: [{ text: "+70 to 79 to maximum Life", min: 70, max: 79 }], weight: 200 },
      { tier: 5, name: "Rotund", level: 36, stats: [{ text: "+60 to 69 to maximum Life", min: 60, max: 69 }], weight: 400 },
      { tier: 6, name: "Fecund", level: 30, stats: [{ text: "+50 to 59 to maximum Life", min: 50, max: 59 }], weight: 600 },
    ],
  };

  /** Attack speed suffix */
  const attackSpeedMod = {
    mod_name: "% increased Attack Speed",
    generation_type: "suffix",
    domain: "item",
    tiers: [
      { tier: 1, name: "of Celebration", level: 76, stats: [{ text: "+16% increased Attack Speed", min: 16, max: 16 }], weight: 25 },
      { tier: 2, name: "of Renown", level: 60, stats: [{ text: "+13% to 14% increased Attack Speed", min: 13, max: 14 }], weight: 50 },
      { tier: 3, name: "of Infamy", level: 45, stats: [{ text: "+11% to 12% increased Attack Speed", min: 11, max: 12 }], weight: 100 },
    ],
  };

  /** Flask mod — different domain */
  const flaskMod = {
    mod_name: "% increased Duration",
    generation_type: "prefix",
    domain: "flask",
    tiers: [
      { tier: 1, name: "Enduring", level: 55, stats: [{ text: "+30% to 40% increased Duration", min: 30, max: 40 }], weight: 100 },
      { tier: 2, name: "Long", level: 25, stats: [{ text: "+20% to 29% increased Duration", min: 20, max: 29 }], weight: 200 },
    ],
  };

  /** Jewel mod — yet another domain */
  const jewelMod = {
    mod_name: "% increased maximum Life",
    generation_type: "prefix",
    domain: "jewel",
    tiers: [
      { tier: 1, name: "", level: 1, stats: [{ text: "+5% to 7% increased maximum Life", min: 5, max: 7 }], weight: 500 },
    ],
  };

  /** Physical damage search — mixed prefixes and suffixes */
  const physicalDamageSearch = {
    icon_url: iconUrl,
    query: "physical damage",
    mods: [physDmgMod, attackSpeedMod, lifeMod],
    count: 3,
  };

  /** Fire resistance search — single mod with tiers */
  const fireResSearch = {
    icon_url: iconUrl,
    query: "fire resistance",
    mods: [fireResMod],
    count: 1,
  };

  /** Mixed domain search */
  const mixedDomainSearch = {
    icon_url: iconUrl,
    query: "duration",
    mods: [flaskMod, jewelMod, lifeMod],
    count: 3,
  };

  /** Crafting-focused: all prefix tiers for body armour */
  const craftingSearch = {
    icon_url: iconUrl,
    query: "life",
    generation_type: "prefix",
    item_class: "Body Armour",
    mods: [lifeMod, physDmgMod],
    count: 2,
  };

  /** Empty results */
  const emptySearch = {
    icon_url: iconUrl,
    query: "nonexistent mod xyz",
    mods: [],
    count: 0,
  };
</script>

<!-- Physical damage related mods — mixed prefix/suffix -->
<Story name="PhysicalDamage">
  <ModSearch data={physicalDamageSearch} />
</Story>

<!-- Single mod with tier breakdown -->
<Story name="FireResistance">
  <ModSearch data={fireResSearch} />
</Story>

<!-- Mixed domains: item, flask, jewel -->
<Story name="MixedDomains">
  <ModSearch data={mixedDomainSearch} />
</Story>

<!-- Crafting context: filtered to prefixes on body armour -->
<Story name="CraftingPrefixes">
  <ModSearch data={craftingSearch} />
</Story>

<!-- No results -->
<Story name="NoResults">
  <ModSearch data={emptySearch} />
</Story>
