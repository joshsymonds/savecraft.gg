<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import RatioCalculator from "./ratio-calculator.svelte";

  const { Story } = defineMeta({
    title: "Factorio/Views/RatioCalculator",
    tags: ["autodocs"],
  });

  // Sample data matching actual ratio_calculator DAG output
  const electronicCircuitData = {
    stages: [
      { id: "electronic-circuit", item: "electronic-circuit", recipe: "electronic-circuit", machine_type: "assembling-machine-2", machine_count: 1, rate_per_min: 90, power_kw: 150 },
      { id: "iron-plate", item: "iron-plate", recipe: "iron-plate", machine_type: "stone-furnace", machine_count: 5, rate_per_min: 93.8, power_kw: 450 },
      { id: "copper-cable", item: "copper-cable", recipe: "copper-cable", machine_type: "assembling-machine-2", machine_count: 2, rate_per_min: 270, power_kw: 300 },
      { id: "iron-ore", item: "iron-ore", recipe: "(raw)", rate_per_min: 93.8 },
      { id: "copper-plate", item: "copper-plate", recipe: "copper-plate", machine_type: "stone-furnace", machine_count: 10, rate_per_min: 187.5, power_kw: 900 },
      { id: "copper-ore", item: "copper-ore", recipe: "(raw)", rate_per_min: 187.5 },
    ],
    flows: [
      { source: "iron-plate", target: "electronic-circuit", item: "iron-plate", rate_per_min: 90 },
      { source: "copper-cable", target: "electronic-circuit", item: "copper-cable", rate_per_min: 270 },
      { source: "iron-ore", target: "iron-plate", item: "iron-ore", rate_per_min: 93.8 },
      { source: "copper-plate", target: "copper-cable", item: "copper-plate", rate_per_min: 135 },
      { source: "copper-ore", target: "copper-plate", item: "copper-ore", rate_per_min: 187.5 },
    ],
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
    stages: [
      { id: "iron-gear-wheel", item: "iron-gear-wheel", recipe: "iron-gear-wheel", machine_type: "assembling-machine-3", machine_count: 1, rate_per_min: 450, power_kw: 1312.5 },
      { id: "iron-plate", item: "iron-plate", recipe: "iron-plate", machine_type: "stone-furnace", machine_count: 48, rate_per_min: 900, power_kw: 4320 },
      { id: "iron-ore", item: "iron-ore", recipe: "(raw)", rate_per_min: 900 },
    ],
    flows: [
      { source: "iron-plate", target: "iron-gear-wheel", item: "iron-plate", rate_per_min: 900 },
      { source: "iron-ore", target: "iron-plate", item: "iron-ore", rate_per_min: 900 },
    ],
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
