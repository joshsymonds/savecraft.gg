<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ProductionFlow from "./production-flow.svelte";

  const { Story } = defineMeta({
    title: "Factorio/Views/ProductionFlow",
    tags: ["autodocs"],
  });

  // Healthy mid-game factory: small surpluses, no critical issues
  const healthyFactoryData = {
    item_diagnoses: [
      {
        item: "iron-plate",
        produced_per_min: 480,
        consumed_per_min: 450,
        real_consumed: 450,
        recycler_consumed: 0,
        net_rate: 30,
        severity: "healthy",
      },
      {
        item: "copper-plate",
        produced_per_min: 360,
        consumed_per_min: 320,
        real_consumed: 320,
        recycler_consumed: 0,
        net_rate: 40,
        severity: "healthy",
      },
      {
        item: "stone",
        produced_per_min: 180,
        consumed_per_min: 30,
        real_consumed: 30,
        recycler_consumed: 0,
        net_rate: 150,
        severity: "surplus",
      },
      {
        item: "coal",
        produced_per_min: 200,
        consumed_per_min: 120,
        real_consumed: 120,
        recycler_consumed: 0,
        net_rate: 80,
        severity: "surplus",
      },
    ],
    fluid_diagnoses: [
      {
        item: "petroleum-gas",
        produced_per_min: 1200,
        consumed_per_min: 1050,
        real_consumed: 1050,
        recycler_consumed: 0,
        net_rate: 150,
        severity: "healthy",
      },
    ],
    tech_recommendations: [],
    surplus_connections: [],
  };

  // Bottlenecked factory: critical deficits, root cause chains, surplus connections, tech recs
  const bottleneckedFactoryData = {
    item_diagnoses: [
      {
        item: "steel-plate",
        produced_per_min: 38,
        consumed_per_min: 1175,
        real_consumed: 16,
        recycler_consumed: 0,
        net_rate: -1137,
        severity: "severe",
        consumers: [
          { recipe: "low-density-structure", item: "low-density-structure", rate: 6, percent: 37.5, is_recycling: false },
          { recipe: "engine-unit", item: "engine-unit", rate: 6, percent: 37.5, is_recycling: false },
          { recipe: "piercing-rounds-magazine", item: "piercing-rounds-magazine", rate: 3, percent: 18.8, is_recycling: false },
        ],
        root_cause: { chain: ["steel-plate"], root_item: "steel-plate", bottleneck_type: "not_built" },
      },
      {
        item: "electronic-circuit",
        produced_per_min: 90,
        consumed_per_min: 162,
        real_consumed: 162,
        recycler_consumed: 0,
        net_rate: -72,
        severity: "severe",
        consumers: [
          { recipe: "processing-unit", item: "processing-unit", rate: 40, percent: 46, is_recycling: false },
          { recipe: "advanced-circuit", item: "advanced-circuit", rate: 26, percent: 29.9, is_recycling: false },
          { recipe: "inserter", item: "inserter", rate: 14, percent: 16.1, is_recycling: false },
        ],
        machine_gap: {
          machine_type: "assembling-machine-3",
          current_count: 16,
          effective_rate: 2400,
          additional_needed: 1,
          recipe: "electronic-circuit",
        },
        root_cause: {
          chain: ["electronic-circuit", "copper-cable"],
          root_item: "copper-cable",
          bottleneck_type: "input_starvation",
        },
      },
      {
        item: "engine-unit",
        produced_per_min: 6,
        consumed_per_min: 35,
        real_consumed: 35,
        recycler_consumed: 0,
        net_rate: -29,
        severity: "severe",
        consumers: [
          { recipe: "chemical-science-pack", item: "chemical-science-pack", rate: 14, percent: 87.5, is_recycling: false },
          { recipe: "electric-engine-unit", item: "electric-engine-unit", rate: 2, percent: 12.5, is_recycling: false },
        ],
        machine_gap: {
          machine_type: "assembling-machine-2",
          current_count: 21,
          effective_rate: 4.7,
          additional_needed: 130,
          recipe: "engine-unit",
        },
        root_cause: {
          chain: ["engine-unit", "steel-plate"],
          root_item: "steel-plate",
          bottleneck_type: "not_built",
        },
      },
      {
        item: "space-science-pack",
        produced_per_min: 0,
        consumed_per_min: 55,
        real_consumed: 55,
        recycler_consumed: 0,
        net_rate: -55,
        severity: "critical",
        machine_gap: {
          machine_type: "assembling-machine-3",
          current_count: 14,
          effective_rate: 12.2,
          additional_needed: 64,
          recipe: "space-science-pack",
        },
        root_cause: {
          chain: ["space-science-pack"],
          root_item: "space-science-pack",
          bottleneck_type: "throughput",
        },
      },
      {
        item: "uranium-235",
        produced_per_min: 0,
        consumed_per_min: 6,
        real_consumed: 6,
        recycler_consumed: 0,
        net_rate: -6,
        severity: "critical",
        root_cause: { chain: ["uranium-235"], root_item: "uranium-235", bottleneck_type: "not_built" },
      },
      {
        item: "copper-cable",
        produced_per_min: 538,
        consumed_per_min: 540,
        real_consumed: 540,
        recycler_consumed: 0,
        net_rate: -2,
        severity: "moderate",
        machine_gap: {
          machine_type: "assembling-machine-3",
          current_count: 37,
          effective_rate: 202.5,
          additional_needed: 1,
          recipe: "copper-cable",
        },
        root_cause: { chain: ["copper-cable"], root_item: "copper-cable", bottleneck_type: "throughput" },
      },
      {
        item: "iron-plate",
        produced_per_min: 4884,
        consumed_per_min: 2924,
        real_consumed: 2924,
        recycler_consumed: 0,
        net_rate: 1960,
        severity: "surplus",
      },
      {
        item: "copper-plate",
        produced_per_min: 351,
        consumed_per_min: 0,
        real_consumed: 0,
        recycler_consumed: 0,
        net_rate: 351,
        severity: "surplus",
      },
    ],
    fluid_diagnoses: [
      {
        item: "crude-oil",
        produced_per_min: 400,
        consumed_per_min: 8811.7,
        real_consumed: 8811.7,
        recycler_consumed: 0,
        net_rate: -8411.7,
        severity: "severe",
        consumers: [
          { recipe: "advanced-oil-processing", item: "heavy-oil", rate: 480, percent: 100, is_recycling: false },
        ],
        root_cause: { chain: ["crude-oil"], root_item: "crude-oil", bottleneck_type: "not_built" },
      },
      {
        item: "thruster-fuel",
        produced_per_min: 0,
        consumed_per_min: 1275,
        real_consumed: 1275,
        recycler_consumed: 0,
        net_rate: -1275,
        severity: "critical",
        machine_gap: {
          machine_type: "chemical-plant",
          current_count: 1,
          effective_rate: 1858.5,
          additional_needed: 1,
          recipe: "thruster-fuel",
        },
        root_cause: { chain: ["thruster-fuel"], root_item: "thruster-fuel", bottleneck_type: "throughput" },
      },
      {
        item: "sulfuric-acid",
        produced_per_min: 560,
        consumed_per_min: 50,
        real_consumed: 50,
        recycler_consumed: 0,
        net_rate: 510,
        severity: "surplus",
      },
    ],
    tech_recommendations: [
      {
        tech: "foundry",
        recipes_unlocked: ["casting-steel", "casting-iron-stick", "molten-iron-from-lava"],
        deficit_items: ["steel-plate", "iron-stick", "stone"],
        inputs_available: true,
      },
      {
        tech: "advanced-asteroid-processing",
        recipes_unlocked: ["advanced-metallic-asteroid-crushing", "advanced-thruster-fuel"],
        deficit_items: ["iron-ore", "thruster-fuel"],
        inputs_available: false,
      },
    ],
    surplus_connections: [
      { surplus: "iron-plate", surplus_rate: 1960, deficit: "electronic-circuit", recipe: "electronic-circuit" },
      { surplus: "iron-plate", surplus_rate: 1960, deficit: "space-science-pack", recipe: "space-science-pack" },
      { surplus: "sulfuric-acid", surplus_rate: 510, deficit: "processing-unit", recipe: "processing-unit" },
      { surplus: "copper-plate", surplus_rate: 351, deficit: "copper-cable", recipe: "copper-cable" },
    ],
  };

  // Early game factory: few items, one moderate deficit
  const earlyGameFactoryData = {
    item_diagnoses: [
      {
        item: "iron-plate",
        produced_per_min: 60,
        consumed_per_min: 75,
        real_consumed: 75,
        recycler_consumed: 0,
        net_rate: -15,
        severity: "moderate",
        consumers: [
          { recipe: "iron-gear-wheel", item: "iron-gear-wheel", rate: 40, percent: 53.3, is_recycling: false },
          { recipe: "iron-stick", item: "iron-stick", rate: 20, percent: 26.7, is_recycling: false },
        ],
        machine_gap: {
          machine_type: "stone-furnace",
          current_count: 6,
          effective_rate: 60,
          additional_needed: 1,
          recipe: "iron-plate",
        },
        root_cause: { chain: ["iron-plate"], root_item: "iron-plate", bottleneck_type: "throughput" },
      },
      {
        item: "copper-plate",
        produced_per_min: 40,
        consumed_per_min: 35,
        real_consumed: 35,
        recycler_consumed: 0,
        net_rate: 5,
        severity: "healthy",
      },
      {
        item: "wood",
        produced_per_min: 20,
        consumed_per_min: 2,
        real_consumed: 2,
        recycler_consumed: 0,
        net_rate: 18,
        severity: "surplus",
      },
    ],
    fluid_diagnoses: [],
    tech_recommendations: [],
    surplus_connections: [],
  };
</script>

<Story name="HealthyFactory">
  <ProductionFlow data={healthyFactoryData} />
</Story>

<Story name="BottleneckedFactory">
  <ProductionFlow data={bottleneckedFactoryData} />
</Story>

<Story name="EarlyGameFactory">
  <ProductionFlow data={earlyGameFactoryData} />
</Story>
