<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import RatioCalculator from "./ratio-calculator.svelte";

  const { Story } = defineMeta({
    title: "Factorio/Ratio Calculator",
    tags: ["autodocs"],
  });

  // Sample data matching actual ratio_calculator output
  const electronicCircuitData = {
    production_tree: {
      item: "electronic-circuit",
      recipe: "electronic-circuit",
      machines: 1,
      machine_type: "assembling-machine-2",
      rate_per_min: 90,
      belt_tier: "yellow",
      power_kw: 150,
      children: [
        {
          item: "iron-plate",
          recipe: "iron-plate",
          machines: 5,
          machine_type: "stone-furnace",
          rate_per_min: 93.8,
          belt_tier: "yellow",
          power_kw: 450,
          children: [
            {
              item: "iron-ore",
              recipe: "(raw)",
              rate_per_min: 93.8,
              belt_tier: "yellow",
            },
          ],
        },
        {
          item: "copper-cable",
          recipe: "copper-cable",
          machines: 2,
          machine_type: "assembling-machine-2",
          rate_per_min: 270,
          belt_tier: "yellow",
          power_kw: 300,
          children: [
            {
              item: "copper-plate",
              recipe: "copper-plate",
              machines: 10,
              machine_type: "stone-furnace",
              rate_per_min: 187.5,
              belt_tier: "yellow",
              power_kw: 900,
              children: [
                {
                  item: "copper-ore",
                  recipe: "(raw)",
                  rate_per_min: 187.5,
                  belt_tier: "yellow",
                },
              ],
            },
          ],
        },
      ],
    },
    raw_materials: [
      { item: "iron-ore", rate_per_min: 93.8, belt_tier: "yellow" },
      { item: "copper-ore", rate_per_min: 187.5, belt_tier: "yellow" },
    ],
    total_power_kw: 1800,
    config: {
      assembler_tier: "assembling-machine-2",
      modules: null,
      beacon_count: 0,
      beacon_modules: null,
    },
  };

  const modulesData = {
    production_tree: {
      item: "iron-gear-wheel",
      recipe: "iron-gear-wheel",
      machines: 1,
      machine_type: "assembling-machine-3",
      rate_per_min: 450,
      belt_tier: "blue",
      power_kw: 1312.5,
      children: [
        {
          item: "iron-plate",
          recipe: "iron-plate",
          machines: 48,
          machine_type: "stone-furnace",
          rate_per_min: 900,
          belt_tier: "turbo",
          power_kw: 4320,
          children: [
            {
              item: "iron-ore",
              recipe: "(raw)",
              rate_per_min: 900,
              belt_tier: "turbo",
            },
          ],
        },
      ],
    },
    raw_materials: [
      { item: "iron-ore", rate_per_min: 900, belt_tier: "turbo" },
    ],
    total_power_kw: 5632.5,
    config: {
      assembler_tier: "assembling-machine-3",
      modules: ["speed-module-3", "speed-module-3", "speed-module-3", "speed-module-3"],
      beacon_count: 0,
      beacon_modules: null,
    },
  };
</script>

<Story name="ElectronicCircuit">
  <RatioCalculator data={electronicCircuitData} />
</Story>

<Story name="WithSpeedModules">
  <RatioCalculator data={modulesData} />
</Story>
