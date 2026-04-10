<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import UniqueSearch from "./unique-search.svelte";
  const { Story } = defineMeta({ title: "PoE/Views/UniqueSearch", tags: ["autodocs"] });

  const iconUrl = "/plugins/poe/icon.png";

  const lifeUniques = {
    icon_url: iconUrl,
    query: "life",
    items: [
      {
        name: "Kaom's Heart",
        base_type: "Glorious Plate",
        item_class: "Body Armour",
        level_requirement: 68,
        str_requirement: 191,
        properties: [{ label: "Armour", value: "553" }],
        explicit_mods: [
          "Has no Sockets",
          "+500 to maximum Life",
          "20% increased Fire Damage",
        ],
        flavour_text: "The warrior who fears will fall.",
        price: { chaos: 150, divine: 1.2, confidence: "high" },
      },
      {
        name: "Belly of the Beast",
        base_type: "Full Wyrmscale",
        item_class: "Body Armour",
        level_requirement: 46,
        str_requirement: 68,
        dex_requirement: 68,
        properties: [
          { label: "Armour", value: "418" },
          { label: "Evasion", value: "418" },
        ],
        implicit_mods: ["+12% to all Elemental Resistances"],
        explicit_mods: [
          "30% increased maximum Life",
          "+15% to all Elemental Resistances",
          "50% increased Flask Life Recovery rate",
          "Extra gore",
        ],
        flavour_text: "There is no safer place than inside the belly of the beast.",
        price: { chaos: 5, confidence: "high" },
      },
    ],
  };

  const headhunterSearch = {
    icon_url: iconUrl,
    query: "headhunter",
    items: [
      {
        name: "Headhunter",
        base_type: "Leather Belt",
        item_class: "Belt",
        level_requirement: 40,
        implicit_mods: ["+25 to maximum Life"],
        explicit_mods: [
          "+60 to Strength",
          "+60 to Dexterity",
          "+50 to maximum Life",
          "25% increased Damage with Hits against Rare monsters",
          "When you Kill a Rare monster, you gain its Modifiers for 20 seconds",
        ],
        flavour_text: "A man's soul rules from a cavern of bone, learns and judges through flesh-born windows. The heart is the servant. The head is the master.",
        price: { chaos: 45000, divine: 360, confidence: "high" },
      },
    ],
  };

  const noPriceSearch = {
    icon_url: iconUrl,
    query: "tabula",
    items: [
      {
        name: "Tabula Rasa",
        base_type: "Simple Robe",
        item_class: "Body Armour",
        level_requirement: 1,
        properties: [{ label: "Energy Shield", value: "15" }],
        explicit_mods: [
          "Has no Stats",
          "Has 6 White Sockets",
          "Has 6 Linked Sockets",
        ],
        flavour_text: "The start of all things.",
      },
    ],
  };

  const emptySearch = {
    icon_url: iconUrl,
    query: "nonexistent unique xyz",
    items: [],
  };
</script>

<!-- Life-focused uniques with pricing -->
<Story name="LifeUniques">
  <UniqueSearch data={lifeUniques} />
</Story>

<!-- Single expensive result -->
<Story name="HeadhunterSearch">
  <UniqueSearch data={headhunterSearch} />
</Story>

<!-- Without price data -->
<Story name="NoPricing">
  <UniqueSearch data={noPriceSearch} />
</Story>

<!-- Empty results -->
<Story name="NoResults">
  <UniqueSearch data={emptySearch} />
</Story>
