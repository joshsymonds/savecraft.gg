<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import Economy from "./economy.svelte";
  const { Story } = defineMeta({ title: "PoE/Views/Economy", tags: ["autodocs"] });

  const iconUrl = "/plugins/poe/icon.png";

  const uniquePrices = {
    icon_url: iconUrl,
    query: "kaom",
    league: "Mirage",
    items: [
      {
        name: "Kaom's Heart",
        type: "UniqueArmour",
        base_type: "Glorious Plate",
        chaos_value: 150,
        divine_value: 1.2,
        confidence: "high",
        sparkline: [120, 130, 125, 140, 155, 148, 150],
        change_7d: 12.5,
        listings: 847,
      },
      {
        name: "Kaom's Roots",
        type: "UniqueArmour",
        base_type: "Titan Greaves",
        chaos_value: 8,
        confidence: "high",
        sparkline: [10, 9, 8, 8, 7, 8, 8],
        change_7d: -2.1,
        listings: 2103,
      },
      {
        name: "Kaom's Way",
        type: "UniqueAccessory",
        base_type: "Coral Ring",
        chaos_value: 35,
        confidence: "high",
        sparkline: [30, 32, 33, 35, 34, 36, 35],
        change_7d: 8.3,
        listings: 312,
      },
      {
        name: "Kaom's Sign",
        type: "UniqueAccessory",
        base_type: "Coral Ring",
        chaos_value: 1,
        confidence: "high",
        sparkline: [1, 1, 1, 1, 1, 1, 1],
        change_7d: 0,
        listings: 5420,
      },
    ],
  };

  const expensiveItems = {
    icon_url: iconUrl,
    league: "Mirage",
    items: [
      {
        name: "Headhunter",
        type: "UniqueAccessory",
        base_type: "Leather Belt",
        chaos_value: 45000,
        divine_value: 360,
        confidence: "high",
        sparkline: [42000, 43000, 44000, 43500, 44500, 45000, 45000],
        change_7d: 7.1,
        listings: 89,
        level_required: 40,
        mods: {
          implicit: [],
          explicit: [
            "+(50-65) to all Attributes",
            "+(35-65) to maximum Life",
            "(20-30)% increased Damage",
            "(15-25)% increased Movement Speed",
            "When you Kill a Rare monster, you gain its Modifiers for 60 seconds",
          ],
          mutated: [],
          flavour: "We were strong once, before the killing.",
        },
      },
      {
        name: "Mageblood",
        type: "UniqueAccessory",
        base_type: "Heavy Belt",
        chaos_value: 85000,
        divine_value: 680,
        confidence: "high",
        sparkline: [80000, 82000, 83000, 84000, 84000, 85000, 85000],
        change_7d: 6.3,
        listings: 34,
        level_required: 64,
        mods: {
          implicit: ["+(25-35) to Strength"],
          explicit: [
            "(8-12)% increased maximum Life",
            "Magic Utility Flasks cannot be Removed",
            "Your Magic Utility Flasks are always active",
            "+1 to Maximum number of Magic Utility Flasks you can have active",
          ],
          mutated: [],
          flavour: "Stand astride two worlds, but be of neither.",
        },
      },
    ],
  };

  const currencyResults = {
    icon_url: iconUrl,
    query: "mirror",
    league: "Mirage",
    items: [
      {
        name: "Mirror of Kalandra",
        type: "Currency",
        base_type: null,
        chaos_value: 950000,
        divine_value: undefined,
        confidence: "high",
        sparkline: [920000, 935000, 940000, 945000, 950000, 950000, 950000],
        change_7d: -5.0,
        listings: 90,
      },
      {
        name: "Mirror Shard",
        type: "Currency",
        base_type: null,
        chaos_value: 47500,
        divine_value: undefined,
        confidence: "high",
        sparkline: [46000, 46500, 47000, 47200, 47500, 47500, 47500],
        change_7d: 3.2,
        listings: 154,
      },
    ],
  };

  const lowConfidence = {
    icon_url: iconUrl,
    query: "replica farrul",
    league: "Mirage",
    items: [
      {
        name: "Replica Farrul's Fur",
        type: "UniqueArmour",
        base_type: "Triumphant Lamellar",
        chaos_value: 2200,
        divine_value: 17.6,
        confidence: "low",
        sparkline: [1800, 2000, 2500, 2100, 2200, 2300, 2200],
        change_7d: 22.2,
        listings: 3,
        level_required: 70,
        mods: {
          implicit: [],
          explicit: [
            "Aspect of the Cat reserves no Mana",
            "(80-100)% increased Armour and Evasion",
            "+(60-80) to maximum Life",
          ],
          mutated: [],
        },
      },
    ],
  };

  const emptySearch = {
    icon_url: iconUrl,
    query: "nonexistent item xyz",
    league: "Mirage",
    items: [],
  };
</script>

<!-- Multiple results for "kaom" -->
<Story name="UniqueSearch">
  <Economy data={uniquePrices} />
</Story>

<!-- Expensive chase items with full mod text + level requirement -->
<Story name="ExpensiveItemsWithMods">
  <Economy data={expensiveItems} />
</Story>

<!-- Currency results — no icons, no mods -->
<Story name="CurrencyResults">
  <Economy data={currencyResults} />
</Story>

<!-- Low confidence listing -->
<Story name="LowConfidence">
  <Economy data={lowConfidence} />
</Story>

<!-- No results -->
<Story name="NoResults">
  <Economy data={emptySearch} />
</Story>
