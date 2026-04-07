<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import TechPath from "./tech-path.svelte";

  const { Story } = defineMeta({
    title: "Stellaris/TechPath",
    tags: ["autodocs"],
  });
</script>

<Story name="DeepChainMixed">
  <TechPath data={{
    target: { key: "tech_mega_engineering", area: "engineering", tier: 5, cost: 48000 },
    chain: [
      { key: "tech_basic_science_lab_1", area: "physics", tier: 0, cost: 500, researched: true },
      { key: "tech_corvettes", area: "engineering", tier: 0, cost: 0, researched: true },
      { key: "tech_fission_power", area: "physics", tier: 1, cost: 1000, researched: true },
      { key: "tech_destroyers", area: "engineering", tier: 2, cost: 2000, researched: true },
      { key: "tech_cold_fusion_power", area: "physics", tier: 2, cost: 2500, researched: false },
      { key: "tech_cruisers", area: "engineering", tier: 3, cost: 4000, researched: false },
      { key: "tech_starbase_3", area: "engineering", tier: 2, cost: 3000, researched: false },
      { key: "tech_antimatter_power", area: "physics", tier: 3, cost: 5000, researched: false },
      { key: "tech_battleships", area: "engineering", tier: 4, cost: 8000, researched: false },
      { key: "tech_citadel_3", area: "engineering", tier: 4, cost: 8000, researched: false },
      { key: "tech_zero_point_power", area: "physics", tier: 4, cost: 10000, researched: false },
    ],
    total_cost: 44000,
    remaining_cost: 40500,
  }} />
</Story>

<Story name="AllResearched">
  <TechPath data={{
    target: { key: "tech_battleships", area: "engineering", tier: 4, cost: 8000 },
    chain: [
      { key: "tech_corvettes", area: "engineering", tier: 0, cost: 0, researched: true },
      { key: "tech_destroyers", area: "engineering", tier: 2, cost: 2000, researched: true },
      { key: "tech_cruisers", area: "engineering", tier: 3, cost: 4000, researched: true },
    ],
    total_cost: 6000,
    remaining_cost: 0,
  }} />
</Story>

<Story name="ShortChain">
  <TechPath data={{
    target: { key: "tech_destroyers", area: "engineering", tier: 2, cost: 2000 },
    chain: [
      { key: "tech_corvettes", area: "engineering", tier: 0, cost: 0, researched: false },
    ],
    total_cost: 0,
    remaining_cost: 0,
  }} />
</Story>

<Story name="NoPrerequisites">
  <TechPath data={{
    target: { key: "tech_basic_industry", area: "engineering", tier: 0, cost: 0 },
    chain: [],
    total_cost: 0,
    remaining_cost: 0,
  }} />
</Story>
