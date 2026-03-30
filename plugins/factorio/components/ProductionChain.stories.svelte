<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ProductionChain from "./ProductionChain.svelte";
  import Panel from "../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../views/src/components/layout/Section.svelte";

  const { Story } = defineMeta({
    title: "Factorio/Components/ProductionChain",
    tags: ["autodocs"],
  });

  // ─── Electronic Circuit (simple chain) ────────────────────────────────────

  const electronicCircuitStages = [
    { id: "electronic-circuit", item: "electronic-circuit", recipe: "electronic-circuit", machine_type: "assembling-machine-2", machine_count: 1, rate_per_min: 90, power_kw: 150 },
    { id: "iron-plate", item: "iron-plate", recipe: "iron-plate", machine_type: "stone-furnace", machine_count: 5, rate_per_min: 93.8, power_kw: 450 },
    { id: "copper-cable", item: "copper-cable", recipe: "copper-cable", machine_type: "assembling-machine-2", machine_count: 2, rate_per_min: 270, power_kw: 300 },
    { id: "iron-ore", item: "iron-ore", recipe: "(raw)", rate_per_min: 93.8 },
    { id: "copper-plate", item: "copper-plate", recipe: "copper-plate", machine_type: "stone-furnace", machine_count: 10, rate_per_min: 187.5, power_kw: 900 },
    { id: "copper-ore", item: "copper-ore", recipe: "(raw)", rate_per_min: 187.5 },
  ];

  const electronicCircuitFlows = [
    { source: "iron-plate", target: "electronic-circuit", item: "iron-plate", rate_per_min: 90 },
    { source: "copper-cable", target: "electronic-circuit", item: "copper-cable", rate_per_min: 270 },
    { source: "iron-ore", target: "iron-plate", item: "iron-ore", rate_per_min: 93.8 },
    { source: "copper-plate", target: "copper-cable", item: "copper-plate", rate_per_min: 135 },
    { source: "copper-ore", target: "copper-plate", item: "copper-ore", rate_per_min: 187.5 },
  ];

  // ─── Electronic Circuit with Save Comparison ──────────────────────────────
  // Player has: 1 assembler (sufficient), 3 furnaces (deficit, needs 5),
  // 2 assemblers for cable (sufficient), 15 furnaces for copper (surplus, needs 10).
  // Iron ore and copper ore are raw (no comparison).

  const comparisonStages = [
    { id: "electronic-circuit", item: "electronic-circuit", recipe: "electronic-circuit", machine_type: "assembling-machine-2", machine_count: 1, rate_per_min: 90, power_kw: 150,
      existing: { machine_type: "assembling-machine-2", count: 1, modules: {}, effective_rate: 90, actual_rate: 85 }, status: "sufficient" },
    { id: "iron-plate", item: "iron-plate", recipe: "iron-plate", machine_type: "stone-furnace", machine_count: 5, rate_per_min: 93.8, power_kw: 450,
      existing: { machine_type: "stone-furnace", count: 3, modules: {}, effective_rate: 56.3, actual_rate: 50 }, deficit_rate: 37.5, status: "deficit" },
    { id: "copper-cable", item: "copper-cable", recipe: "copper-cable", machine_type: "assembling-machine-2", machine_count: 2, rate_per_min: 270, power_kw: 300,
      existing: { machine_type: "assembling-machine-2", count: 2, modules: {}, effective_rate: 270, actual_rate: 260 }, status: "sufficient" },
    { id: "iron-ore", item: "iron-ore", recipe: "(raw)", rate_per_min: 93.8 },
    { id: "copper-plate", item: "copper-plate", recipe: "copper-plate", machine_type: "stone-furnace", machine_count: 10, rate_per_min: 187.5, power_kw: 900,
      existing: { machine_type: "stone-furnace", count: 15, modules: {}, effective_rate: 281.3, actual_rate: 275 }, status: "surplus" },
    { id: "copper-ore", item: "copper-ore", recipe: "(raw)", rate_per_min: 187.5 },
  ];

  const comparisonBottlenecks = [
    { item: "iron-plate", recipe: "iron-plate", needed_rate: 93.8, existing_rate: 56.3, actual_rate: 50, diagnosis: "underbuilt" },
  ];

  // ─── Iron Gear Wheel with Speed Modules ───────────────────────────────────

  const speedModulesStages = [
    { id: "iron-gear-wheel", item: "iron-gear-wheel", recipe: "iron-gear-wheel", machine_type: "assembling-machine-3", machine_count: 1, rate_per_min: 450, power_kw: 1312.5 },
    { id: "iron-plate", item: "iron-plate", recipe: "iron-plate", machine_type: "stone-furnace", machine_count: 48, rate_per_min: 900, power_kw: 4320 },
    { id: "iron-ore", item: "iron-ore", recipe: "(raw)", rate_per_min: 900 },
  ];

  const speedModulesFlows = [
    { source: "iron-plate", target: "iron-gear-wheel", item: "iron-plate", rate_per_min: 900 },
    { source: "iron-ore", target: "iron-plate", item: "iron-ore", rate_per_min: 900 },
  ];

  // ─── Blue Science (DAG with merged nodes) ─────────────────────────────────
  // Real ratio_calculator output for chemical-science-pack at 60/min.
  // Iron-plate appears ONCE feeding 4 consumers. Copper-cable ONCE feeding 2.

  const blueScienceStages = [
    { id: "chemical-science-pack", item: "chemical-science-pack", recipe: "chemical-science-pack", machine_type: "assembling-machine-2", machine_count: 16, rate_per_min: 60, power_kw: 2400 },
    { id: "engine-unit", item: "engine-unit", recipe: "engine-unit", machine_type: "assembling-machine-2", machine_count: 14, rate_per_min: 63, power_kw: 2100 },
    { id: "advanced-circuit", item: "advanced-circuit", recipe: "advanced-circuit", machine_type: "assembling-machine-2", machine_count: 12, rate_per_min: 90, power_kw: 1800 },
    { id: "sulfur", item: "sulfur", recipe: "sulfur", machine_type: "cryogenic-plant", machine_count: 1, rate_per_min: 240, power_kw: 210 },
    { id: "steel-plate", item: "steel-plate", recipe: "steel-plate", machine_type: "steel-furnace", machine_count: 9, rate_per_min: 67.5, power_kw: 810 },
    { id: "iron-gear-wheel", item: "iron-gear-wheel", recipe: "iron-gear-wheel", machine_type: "assembling-machine-2", machine_count: 1, rate_per_min: 90, power_kw: 150 },
    { id: "pipe", item: "pipe", recipe: "pipe", machine_type: "assembling-machine-2", machine_count: 2, rate_per_min: 180, power_kw: 300 },
    { id: "electronic-circuit", item: "electronic-circuit", recipe: "electronic-circuit", machine_type: "assembling-machine-2", machine_count: 2, rate_per_min: 180, power_kw: 300 },
    { id: "plastic-bar", item: "plastic-bar", recipe: "plastic-bar", machine_type: "chemical-plant", machine_count: 2, rate_per_min: 240, power_kw: 1500 },
    { id: "iron-plate", item: "iron-plate", recipe: "iron-plate", machine_type: "steel-furnace", machine_count: 24, rate_per_min: 900, power_kw: 3420 },
    { id: "copper-cable", item: "copper-cable", recipe: "copper-cable", machine_type: "assembling-machine-2", machine_count: 5, rate_per_min: 900, power_kw: 750 },
    { id: "copper-plate", item: "copper-plate", recipe: "copper-plate", machine_type: "steel-furnace", machine_count: 12, rate_per_min: 450, power_kw: 1080 },
    { id: "water", item: "water", recipe: "(raw)", rate_per_min: 3600 },
    { id: "petroleum-gas", item: "petroleum-gas", recipe: "(ambiguous: [advanced-oil-processing basic-oil-processing coal-liquefaction light-oil-cracking])", rate_per_min: 6000 },
    { id: "coal", item: "coal", recipe: "(raw)", rate_per_min: 120 },
    { id: "iron-ore", item: "iron-ore", recipe: "(raw)", rate_per_min: 900 },
    { id: "copper-ore", item: "copper-ore", recipe: "(raw)", rate_per_min: 450 },
  ];

  const blueScienceFlows = [
    // chemical-science-pack inputs
    { source: "engine-unit", target: "chemical-science-pack", item: "engine-unit", rate_per_min: 60 },
    { source: "advanced-circuit", target: "chemical-science-pack", item: "advanced-circuit", rate_per_min: 90 },
    { source: "sulfur", target: "chemical-science-pack", item: "sulfur", rate_per_min: 30 },
    // engine-unit inputs
    { source: "steel-plate", target: "engine-unit", item: "steel-plate", rate_per_min: 63 },
    { source: "iron-gear-wheel", target: "engine-unit", item: "iron-gear-wheel", rate_per_min: 63 },
    { source: "pipe", target: "engine-unit", item: "pipe", rate_per_min: 126 },
    // advanced-circuit inputs
    { source: "electronic-circuit", target: "advanced-circuit", item: "electronic-circuit", rate_per_min: 180 },
    { source: "plastic-bar", target: "advanced-circuit", item: "plastic-bar", rate_per_min: 180 },
    { source: "copper-cable", target: "advanced-circuit", item: "copper-cable", rate_per_min: 360 },
    // sulfur inputs
    { source: "water", target: "sulfur", item: "water", rate_per_min: 1800 },
    { source: "petroleum-gas", target: "sulfur", item: "petroleum-gas", rate_per_min: 1800 },
    // iron-plate → 4 consumers (the key fix!)
    { source: "iron-plate", target: "steel-plate", item: "iron-plate", rate_per_min: 337.5 },
    { source: "iron-plate", target: "iron-gear-wheel", item: "iron-plate", rate_per_min: 180 },
    { source: "iron-plate", target: "pipe", item: "iron-plate", rate_per_min: 180 },
    { source: "iron-plate", target: "electronic-circuit", item: "iron-plate", rate_per_min: 180 },
    // copper-cable → 2 consumers
    { source: "copper-cable", target: "electronic-circuit", item: "copper-cable", rate_per_min: 540 },
    // plastic-bar inputs
    { source: "petroleum-gas", target: "plastic-bar", item: "petroleum-gas", rate_per_min: 2400 },
    { source: "coal", target: "plastic-bar", item: "coal", rate_per_min: 120 },
    // copper-plate → copper-cable
    { source: "copper-plate", target: "copper-cable", item: "copper-plate", rate_per_min: 450 },
    // raw materials
    { source: "iron-ore", target: "iron-plate", item: "iron-ore", rate_per_min: 900 },
    { source: "copper-ore", target: "copper-plate", item: "copper-ore", rate_per_min: 450 },
    { source: "water", target: "plastic-bar", item: "water", rate_per_min: 1800 },
  ];
</script>

<Story name="ElectronicCircuit">
  <Panel>
    <Section title="Electronic Circuit Production">
      <ProductionChain stages={electronicCircuitStages} flows={electronicCircuitFlows} />
    </Section>
  </Panel>
</Story>

<Story name="BlueScienceChain">
  <Panel>
    <Section title="Blue Science — DAG with Merged Nodes">
      <ProductionChain stages={blueScienceStages} flows={blueScienceFlows} />
    </Section>
  </Panel>
</Story>

<Story name="WithSpeedModules">
  <Panel>
    <Section title="Iron Gear Wheel (Speed Modules)">
      <ProductionChain stages={speedModulesStages} flows={speedModulesFlows} />
    </Section>
  </Panel>
</Story>

<Story name="WithComparison">
  <Panel>
    <Section title="Electronic Circuit — Save Comparison">
      <ProductionChain stages={comparisonStages} flows={electronicCircuitFlows} bottlenecks={comparisonBottlenecks} />
    </Section>
  </Panel>
</Story>
