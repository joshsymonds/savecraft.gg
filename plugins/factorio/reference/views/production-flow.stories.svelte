<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ProductionFlow from "./production-flow.svelte";

  const { Story } = defineMeta({
    title: "Factorio/Views/ProductionFlow",
    tags: ["autodocs"],
  });

  // Healthy mid-game factory: no bottlenecks, everything balanced
  const healthyFactoryData = {
    summary: {
      bottleneck_count: 0,
      independent_count: 0,
      active_count: 5,
      critical_count: 0,
    },
    bottlenecks: [],
    independent: [],
    tech_recommendations: [],
  };

  // Real production data: multiple independent bottleneck trees
  const bottleneckedFactoryData = {
    summary: {
      bottleneck_count: 3,
      independent_count: 3,
      active_count: 28,
      critical_count: 5,
    },
    bottlenecks: [
      {
        root_item: "steel-plate",
        bottleneck_type: "not_built",
        severity: "severe",
        net_rate: -1137,
        produced_per_min: 38,
        consumed_per_min: 1175,
        consumers: [
          { recipe: "low-density-structure", item: "low-density-structure", rate: 6, percent: 37.5, is_recycling: false },
          { recipe: "engine-unit", item: "engine-unit", rate: 6, percent: 37.5, is_recycling: false },
          { recipe: "piercing-rounds-magazine", item: "piercing-rounds-magazine", rate: 3, percent: 18.8, is_recycling: false },
          { recipe: "flying-robot-frame", item: "flying-robot-frame", rate: 1, percent: 6.3, is_recycling: false },
        ],
        affected: [
          { item: "engine-unit", net_rate: -29, severity: "severe" },
          { item: "low-density-structure", net_rate: -1, severity: "moderate" },
          { item: "flying-robot-frame", net_rate: -1, severity: "moderate" },
          { item: "piercing-rounds-magazine", net_rate: 0, severity: "healthy" },
        ],
        fixable_from: [
          { item: "iron-plate", surplus_rate: 1960 },
        ],
        tech: [
          { tech: "foundry", recipes_unlocked: ["casting-steel"], inputs_available: true },
        ],
      },
      {
        root_item: "copper-cable",
        bottleneck_type: "throughput",
        severity: "moderate",
        net_rate: -2,
        produced_per_min: 538,
        consumed_per_min: 540,
        machine_gap: {
          machine_type: "assembling-machine-3",
          current_count: 37,
          effective_rate: 202.5,
          additional_needed: 1,
          recipe: "copper-cable",
        },
        consumers: [
          { recipe: "electronic-circuit", item: "electronic-circuit", rate: 270, percent: 83.9, is_recycling: false },
          { recipe: "advanced-circuit", item: "advanced-circuit", rate: 52, percent: 16.1, is_recycling: false },
        ],
        affected: [
          { item: "electronic-circuit", net_rate: -72, severity: "severe" },
          { item: "advanced-circuit", net_rate: -3, severity: "moderate" },
          { item: "processing-unit", net_rate: -1, severity: "moderate" },
          { item: "inserter", net_rate: -4, severity: "moderate" },
          { item: "logistic-science-pack", net_rate: -4, severity: "moderate" },
          { item: "utility-science-pack", net_rate: -3, severity: "critical" },
          { item: "production-science-pack", net_rate: -3, severity: "critical" },
        ],
        fixable_from: [
          { item: "copper-plate", surplus_rate: 351 },
        ],
        tech: [],
      },
      {
        root_item: "crude-oil",
        bottleneck_type: "not_built",
        severity: "severe",
        net_rate: -8411.7,
        produced_per_min: 400,
        consumed_per_min: 8811.7,
        consumers: [
          { recipe: "advanced-oil-processing", item: "heavy-oil", rate: 480, percent: 100, is_recycling: false },
        ],
        affected: [],
        fixable_from: [],
        tech: [],
      },
    ],
    independent: [
      {
        item: "space-science-pack",
        severity: "critical",
        net_rate: -55,
        produced_per_min: 0,
        consumed_per_min: 55,
        bottleneck_type: "throughput",
        machine_gap: {
          machine_type: "assembling-machine-3",
          current_count: 14,
          effective_rate: 12.2,
          additional_needed: 64,
          recipe: "space-science-pack",
        },
      },
      {
        item: "uranium-235",
        severity: "critical",
        net_rate: -6,
        produced_per_min: 0,
        consumed_per_min: 6,
        bottleneck_type: "not_built",
      },
      {
        item: "stone",
        severity: "severe",
        net_rate: -708,
        produced_per_min: 282,
        consumed_per_min: 990,
        bottleneck_type: "not_built",
        machine_gap: {
          machine_type: "electric-mining-drill",
          current_count: 0,
          effective_rate: 0,
          additional_needed: 12,
          recipe: "stone",
        },
      },
    ],
    tech_recommendations: [
      {
        tech: "advanced-asteroid-processing",
        recipes_unlocked: ["advanced-metallic-asteroid-crushing", "advanced-thruster-fuel", "advanced-thruster-oxidizer"],
        deficit_items: ["iron-ore", "thruster-fuel", "thruster-oxidizer"],
        inputs_available: false,
      },
    ],
  };

  // Early game factory: single bottleneck, simple case
  const earlyGameFactoryData = {
    summary: {
      bottleneck_count: 1,
      independent_count: 0,
      active_count: 3,
      critical_count: 0,
    },
    bottlenecks: [
      {
        root_item: "iron-plate",
        bottleneck_type: "throughput",
        severity: "moderate",
        net_rate: -15,
        produced_per_min: 60,
        consumed_per_min: 75,
        machine_gap: {
          machine_type: "stone-furnace",
          current_count: 6,
          effective_rate: 60,
          additional_needed: 1,
          recipe: "iron-plate",
        },
        consumers: [
          { recipe: "iron-gear-wheel", item: "iron-gear-wheel", rate: 40, percent: 53.3, is_recycling: false },
          { recipe: "iron-stick", item: "iron-stick", rate: 20, percent: 26.7, is_recycling: false },
        ],
        affected: [
          { item: "iron-gear-wheel", net_rate: -5, severity: "moderate" },
        ],
        fixable_from: [],
        tech: [],
      },
    ],
    independent: [],
    tech_recommendations: [],
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
