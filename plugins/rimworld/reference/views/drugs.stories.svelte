<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Drugs from "./drugs.svelte";

  const { Story } = defineMeta({
    title: "RimWorld/Drugs",
    tags: ["autodocs"],
  });
</script>

<Story name="DrugList">
  <Drugs data={{
    drugs: [
      { name: "flake", market_value: 14, category: "Hard", addictiveness: 0.2, ingredients: ["Psychoid_leaves:4"] },
      { name: "yayo", market_value: 21, category: "Hard", addictiveness: 0.1, ingredients: ["Psychoid_leaves:8"] },
      { name: "smokeleaf joint", market_value: 11, category: "Social", addictiveness: 0.02, ingredients: ["SmokeleafLeaves:4"] },
      { name: "beer", market_value: 12, category: "Social", addictiveness: 0.01, ingredients: ["RawHops:25"] },
      { name: "penoxycyline", market_value: 18, category: "Medical", addictiveness: 0.0, ingredients: ["Neutroamine:2"] },
      { name: "go-juice", market_value: 53, category: "Hard", addictiveness: 0.1, ingredients: ["Neutroamine:2", "Yayo:1"] },
    ],
  }} />
</Story>

<Story name="FlakeProfile">
  <Drugs data={{
    drug: "flake",
    category: "Hard",
    market_value: 14,
    addictiveness: 0.2,
    work_amount: 250,
  }} />
</Story>

<Story name="FlakeProduction">
  <Drugs data={{
    drug: "flake",
    category: "Hard",
    crop: "psychoid plant",
    soil_fertility: 1.0,
    actual_grow_days: 5.71,
    leaves_per_day: 1.4,
    drugs_per_day: 0.35,
    silver_per_day: 4.9,
  }} />
</Story>

<Story name="BeerProduction">
  <Drugs data={{
    drug: "beer",
    category: "Social",
    crop: "hop plant",
    soil_fertility: 1.4,
    actual_grow_days: 7.35,
    leaves_per_day: 3.4,
    drugs_per_day: 0.136,
    silver_per_day: 1.63,
  }} />
</Story>
