<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import Economy from "./economy.svelte";
  const { Story } = defineMeta({ title: "PoE/Views/Economy", tags: ["autodocs"] });

  const iconUrl = "/plugins/poe/icon.png";

  const uniquePrices = {
    icon_url: iconUrl,
    query: "kaom",
    league: "Settlers of Kalguur",
    items: [
      {
        name: "Kaom's Heart",
        type: "Unique Armour",
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
        type: "Unique Armour",
        base_type: "Titan Greaves",
        chaos_value: 8,
        confidence: "high",
        sparkline: [10, 9, 8, 8, 7, 8, 8],
        change_7d: -2.1,
        listings: 2103,
      },
      {
        name: "Kaom's Way",
        type: "Unique Accessory",
        base_type: "Coral Ring",
        chaos_value: 35,
        confidence: "high",
        sparkline: [30, 32, 33, 35, 34, 36, 35],
        change_7d: 8.3,
        listings: 312,
      },
      {
        name: "Kaom's Sign",
        type: "Unique Accessory",
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
    league: "Settlers of Kalguur",
    items: [
      {
        name: "Headhunter",
        type: "Unique Accessory",
        base_type: "Leather Belt",
        chaos_value: 45000,
        divine_value: 360,
        confidence: "high",
        sparkline: [42000, 43000, 44000, 43500, 44500, 45000, 45000],
        change_7d: 7.1,
        listings: 89,
      },
      {
        name: "Mageblood",
        type: "Unique Accessory",
        base_type: "Heavy Belt",
        chaos_value: 85000,
        divine_value: 680,
        confidence: "high",
        sparkline: [80000, 82000, 83000, 84000, 84000, 85000, 85000],
        change_7d: 6.3,
        listings: 34,
      },
      {
        name: "Mirror of Kalandra",
        type: "Currency",
        chaos_value: 250000,
        divine_value: 2000,
        confidence: "high",
        sparkline: [240000, 242000, 245000, 248000, 250000, 250000, 250000],
        change_7d: 4.2,
        listings: 12,
      },
    ],
  };

  const lowConfidence = {
    icon_url: iconUrl,
    query: "replica farrul",
    league: "Settlers of Kalguur",
    items: [
      {
        name: "Replica Farrul's Fur",
        type: "Unique Armour",
        base_type: "Triumphant Lamellar",
        chaos_value: 2200,
        divine_value: 17.6,
        confidence: "low",
        sparkline: [1800, 2000, 2500, 2100, 2200, 2300, 2200],
        change_7d: 22.2,
        listings: 3,
      },
    ],
  };

  const emptySearch = {
    icon_url: iconUrl,
    query: "nonexistent item xyz",
    league: "Settlers of Kalguur",
    items: [],
  };
</script>

<!-- Multiple results for "kaom" -->
<Story name="UniqueSearch">
  <Economy data={uniquePrices} />
</Story>

<!-- Expensive chase items -->
<Story name="ExpensiveItems">
  <Economy data={expensiveItems} />
</Story>

<!-- Low confidence listing -->
<Story name="LowConfidence">
  <Economy data={lowConfidence} />
</Story>

<!-- No results -->
<Story name="NoResults">
  <Economy data={emptySearch} />
</Story>
