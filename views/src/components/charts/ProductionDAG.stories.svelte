<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ProductionDAG from "./ProductionDAG.svelte";
  import Panel from "../layout/Panel.svelte";
  import Section from "../layout/Section.svelte";

  const { Story } = defineMeta({
    title: "Components/Charts/ProductionDAG",
    tags: ["autodocs"],
  });

  // Simple linear chain: iron-ore → iron-plate → iron-gear-wheel
  const linearNodes = [
    { id: "iron-ore", label: "Iron ore", icon: "iron-ore", rate: "180/m", variant: "raw" },
    { id: "iron-plate", label: "Iron plate", sublabel: "×10 Stone Furnace", icon: "iron-plate", rate: "187.5/m" },
    { id: "iron-gear-wheel", label: "Iron gear wheel", sublabel: "×1 AM2", icon: "iron-gear-wheel", rate: "90/m" },
  ];
  const linearEdges = [
    { source: "iron-ore", target: "iron-plate", rate: 180 },
    { source: "iron-plate", target: "iron-gear-wheel", rate: 180 },
  ];

  // Branching tree: electronic circuit
  const circuitNodes = [
    { id: "copper-ore", label: "Copper ore", icon: "copper-ore", rate: "187.5/m", variant: "raw" },
    { id: "iron-ore", label: "Iron ore", icon: "iron-ore", rate: "112.5/m", variant: "raw" },
    { id: "copper-plate", label: "Copper plate", sublabel: "×10 Furnace", icon: "copper-plate", rate: "187.5/m" },
    { id: "iron-plate", label: "Iron plate", sublabel: "×5 Furnace", icon: "iron-plate", rate: "112.5/m" },
    { id: "copper-cable", label: "Copper cable", sublabel: "×2 AM2", icon: "copper-cable", rate: "270/m" },
    { id: "electronic-circuit", label: "Electronic circuit", sublabel: "×1 AM2", icon: "electronic-circuit", rate: "90/m" },
  ];
  const circuitEdges = [
    { source: "copper-ore", target: "copper-plate", rate: 187.5 },
    { source: "iron-ore", target: "iron-plate", rate: 112.5 },
    { source: "copper-plate", target: "copper-cable", rate: 135 },
    { source: "iron-plate", target: "electronic-circuit", rate: 90 },
    { source: "copper-cable", target: "electronic-circuit", rate: 270 },
  ];

  // With bottleneck highlighting
  const bottleneckNodes = [
    { id: "iron-ore", label: "Iron ore", icon: "iron-ore", rate: "300/m", variant: "raw" },
    { id: "iron-plate", label: "Iron plate", sublabel: "×5 Furnace", rate: "300/m", variant: "bottleneck" },
    { id: "steel-plate", label: "Steel plate", sublabel: "×10 Furnace", rate: "200/m" },
    { id: "iron-gear", label: "Iron gear wheel", sublabel: "×2 AM2", rate: "100/m" },
    { id: "target", label: "Engine unit", sublabel: "×4 AM2", rate: "60/m" },
  ];
  const bottleneckEdges = [
    { source: "iron-ore", target: "iron-plate", rate: 300 },
    { source: "iron-plate", target: "steel-plate", rate: 200 },
    { source: "iron-plate", target: "iron-gear", rate: 100 },
    { source: "steel-plate", target: "target", rate: 60 },
    { source: "iron-gear", target: "target", rate: 60 },
  ];
</script>

<Story name="LinearChain">
  <Panel>
    <Section title="Linear Chain: Iron Gear Wheel">
      <ProductionDAG nodes={linearNodes} edges={linearEdges} />
    </Section>
  </Panel>
</Story>

<Story name="BranchingTree">
  <Panel>
    <Section title="Branching: Electronic Circuit">
      <ProductionDAG nodes={circuitNodes} edges={circuitEdges} />
    </Section>
  </Panel>
</Story>

<Story name="BottleneckHighlight">
  <Panel>
    <Section title="Bottleneck Highlighting: Engine Unit">
      <ProductionDAG nodes={bottleneckNodes} edges={bottleneckEdges} />
    </Section>
  </Panel>
</Story>
