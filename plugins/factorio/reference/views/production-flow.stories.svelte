<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ProductionFlow from "./production-flow.svelte";

  const { Story } = defineMeta({
    title: "Factorio/Views/ProductionFlow",
    tags: ["autodocs"],
  });

  // Healthy mid-game factory: high health score, small surpluses, no critical issues
  const healthyFactoryData = {
    health_score: 91,
    item_diagnoses: [
      {
        item: "iron-plate",
        produced_per_min: 480,
        consumed_per_min: 450,
        net_rate: 30,
        severity: "healthy",
      },
      {
        item: "copper-plate",
        produced_per_min: 360,
        consumed_per_min: 320,
        net_rate: 40,
        severity: "healthy",
      },
      {
        item: "steel-plate",
        produced_per_min: 95,
        consumed_per_min: 80,
        net_rate: 15,
        severity: "healthy",
      },
      {
        item: "electronic-circuit",
        produced_per_min: 210,
        consumed_per_min: 195,
        net_rate: 15,
        severity: "healthy",
      },
      {
        item: "stone",
        produced_per_min: 180,
        consumed_per_min: 30,
        net_rate: 150,
        severity: "surplus",
      },
      {
        item: "iron-gear-wheel",
        produced_per_min: 130,
        consumed_per_min: 115,
        net_rate: 15,
        severity: "healthy",
      },
      {
        item: "transport-belt",
        produced_per_min: 60,
        consumed_per_min: 40,
        net_rate: 20,
        severity: "healthy",
      },
      {
        item: "coal",
        produced_per_min: 200,
        consumed_per_min: 120,
        net_rate: 80,
        severity: "surplus",
      },
    ],
    fluid_diagnoses: [
      {
        item: "petroleum-gas",
        produced_per_min: 1200,
        consumed_per_min: 1050,
        net_rate: 150,
        severity: "healthy",
      },
      {
        item: "water",
        produced_per_min: 6000,
        consumed_per_min: 4800,
        net_rate: 1200,
        severity: "surplus",
      },
    ],
    tech_recommendations: [],
    overproduction: [
      {
        item: "stone",
        surplus_rate: 150,
        suggested_recipes: [
          { recipe: "stone-brick", product: "stone-brick" },
          { recipe: "landfill", product: "landfill" },
          { recipe: "stone-furnace", product: "stone-furnace" },
        ],
      },
      {
        item: "coal",
        surplus_rate: 80,
        suggested_recipes: [
          { recipe: "plastic-bar", product: "plastic-bar" },
          { recipe: "explosives", product: "explosives" },
        ],
      },
    ],
  };

  // Bottlenecked factory: multiple critical/severe deficits, machine gaps, cascade risks, tech recs
  const bottleneckedFactoryData = {
    health_score: 35,
    item_diagnoses: [
      {
        item: "copper-plate",
        produced_per_min: 0,
        consumed_per_min: 320,
        net_rate: -320,
        severity: "critical",
        consumers: [
          { recipe: "copper-cable", item: "copper-cable", rate: 200, percent: 62.5 },
          { recipe: "electronic-circuit", item: "electronic-circuit", rate: 90, percent: 28.1 },
          { recipe: "inserter", item: "inserter", rate: 30, percent: 9.4 },
        ],
        cascade: { downstream_count: 12, impact_fraction: 0.52 },
      },
      {
        item: "iron-plate",
        produced_per_min: 180,
        consumed_per_min: 450,
        net_rate: -270,
        severity: "severe",
        consumers: [
          { recipe: "iron-gear-wheel", item: "iron-gear-wheel", rate: 150, percent: 33.3 },
          { recipe: "electronic-circuit", item: "electronic-circuit", rate: 120, percent: 26.7 },
          { recipe: "pipe", item: "pipe", rate: 90, percent: 20 },
          { recipe: "iron-stick", item: "iron-stick", rate: 45, percent: 10 },
        ],
        machine_gap: {
          machine_type: "stone-furnace",
          current_count: 24,
          effective_rate: 180,
          additional_needed: 15,
          recipe: "iron-plate",
        },
        cascade: { downstream_count: 18, impact_fraction: 0.78 },
      },
      {
        item: "steel-plate",
        produced_per_min: 15,
        consumed_per_min: 80,
        net_rate: -65,
        severity: "severe",
        consumers: [
          { recipe: "rail", item: "rail", rate: 30, percent: 46.2 },
          { recipe: "steel-chest", item: "steel-chest", rate: 20, percent: 30.8 },
          { recipe: "electric-furnace", item: "electric-furnace", rate: 15, percent: 23 },
        ],
        machine_gap: {
          machine_type: "stone-furnace",
          current_count: 8,
          effective_rate: 15,
          additional_needed: 35,
          recipe: "steel-plate",
        },
      },
      {
        item: "plastic-bar",
        produced_per_min: 30,
        consumed_per_min: 75,
        net_rate: -45,
        severity: "severe",
        consumers: [
          { recipe: "advanced-circuit", item: "advanced-circuit", rate: 45, percent: 60 },
          { recipe: "low-density-structure", item: "low-density-structure", rate: 30, percent: 40 },
        ],
      },
      {
        item: "electronic-circuit",
        produced_per_min: 90,
        consumed_per_min: 120,
        net_rate: -30,
        severity: "moderate",
      },
      {
        item: "stone",
        produced_per_min: 200,
        consumed_per_min: 25,
        net_rate: 175,
        severity: "surplus",
      },
    ],
    fluid_diagnoses: [
      {
        item: "petroleum-gas",
        produced_per_min: 400,
        consumed_per_min: 800,
        net_rate: -400,
        severity: "severe",
        cascade: { downstream_count: 4, impact_fraction: 0.17 },
      },
      {
        item: "light-oil",
        produced_per_min: 500,
        consumed_per_min: 100,
        net_rate: 400,
        severity: "surplus",
      },
    ],
    tech_recommendations: [
      {
        tech: "advanced-oil-processing",
        recipe_unlocked: "heavy-oil-cracking",
        deficit_item: "petroleum-gas",
        impact: "Unlocks Heavy Oil Cracking recipe, which produces Petroleum Gas",
      },
      {
        tech: "advanced-oil-processing",
        recipe_unlocked: "light-oil-cracking",
        deficit_item: "petroleum-gas",
        impact: "Unlocks Light Oil Cracking recipe, which produces Petroleum Gas",
      },
      {
        tech: "electric-furnace",
        recipe_unlocked: "electric-furnace",
        deficit_item: "steel-plate",
        impact: "Unlocks Electric Furnace recipe, faster smelting for Steel Plate",
      },
    ],
    overproduction: [
      {
        item: "stone",
        surplus_rate: 175,
        suggested_recipes: [
          { recipe: "stone-brick", product: "stone-brick" },
          { recipe: "landfill", product: "landfill" },
        ],
      },
    ],
  };

  // Early game factory: few items, simple production, small deficits
  const earlyGameFactoryData = {
    health_score: 72,
    item_diagnoses: [
      {
        item: "iron-plate",
        produced_per_min: 60,
        consumed_per_min: 75,
        net_rate: -15,
        severity: "moderate",
        consumers: [
          { recipe: "iron-gear-wheel", item: "iron-gear-wheel", rate: 40, percent: 53.3 },
          { recipe: "iron-stick", item: "iron-stick", rate: 20, percent: 26.7 },
          { recipe: "pipe", item: "pipe", rate: 15, percent: 20 },
        ],
        machine_gap: {
          machine_type: "stone-furnace",
          current_count: 6,
          effective_rate: 60,
          additional_needed: 1,
          recipe: "iron-plate",
        },
      },
      {
        item: "copper-plate",
        produced_per_min: 40,
        consumed_per_min: 35,
        net_rate: 5,
        severity: "healthy",
      },
      {
        item: "iron-gear-wheel",
        produced_per_min: 30,
        consumed_per_min: 25,
        net_rate: 5,
        severity: "healthy",
      },
      {
        item: "wood",
        produced_per_min: 20,
        consumed_per_min: 2,
        net_rate: 18,
        severity: "surplus",
      },
    ],
    fluid_diagnoses: [],
    tech_recommendations: [],
    overproduction: [
      {
        item: "wood",
        surplus_rate: 18,
        suggested_recipes: [
          { recipe: "small-electric-pole", product: "small-electric-pole" },
          { recipe: "wooden-chest", product: "wooden-chest" },
        ],
      },
    ],
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
