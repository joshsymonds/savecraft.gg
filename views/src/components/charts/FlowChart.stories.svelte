<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import FlowChart from "./FlowChart.svelte";
  import Panel from "../layout/Panel.svelte";
  import Section from "../layout/Section.svelte";

  const { Story } = defineMeta({
    title: "Components/Charts/FlowChart",
    tags: ["autodocs"],
  });

  // ── Story 1: Simple linear chain with varying flow rates ──
  const linearNodes = [
    { id: "raw-a", label: "Raw Material A", variant: "raw" },
    { id: "intermediate", label: "Intermediate" },
    { id: "product", label: "Final Product" },
  ];
  const linearEdges = [
    { source: "raw-a", target: "intermediate", rate: 180, label: "180/m" },
    { source: "intermediate", target: "product", rate: 90, label: "90/m" },
  ];

  // ── Story 2: Branching tree (2 inputs merge) ──
  const branchNodes = [
    { id: "input-a", label: "Input A", variant: "raw" },
    { id: "input-b", label: "Input B", variant: "raw" },
    { id: "process-a", label: "Process A" },
    { id: "process-b", label: "Process B" },
    { id: "output", label: "Combined Output" },
  ];
  const branchEdges = [
    { source: "input-a", target: "process-a", rate: 200, label: "200/m" },
    { source: "input-b", target: "process-b", rate: 150, label: "150/m" },
    { source: "process-a", target: "output", rate: 120, label: "120/m" },
    { source: "process-b", target: "output", rate: 270, label: "270/m" },
  ];

  // ── Story 3: High fan-in (4 inputs into 1 node) ──
  const fanInNodes = [
    { id: "feed-1", label: "Feed Alpha", variant: "raw" },
    { id: "feed-2", label: "Feed Beta", variant: "raw" },
    { id: "feed-3", label: "Feed Gamma", variant: "raw" },
    { id: "feed-4", label: "Feed Delta", variant: "raw" },
    { id: "collector", label: "Collector", variant: "bottleneck" },
    { id: "final", label: "Final Output" },
  ];
  const fanInEdges = [
    { source: "feed-1", target: "collector", rate: 300, label: "300/m" },
    { source: "feed-2", target: "collector", rate: 150, label: "150/m" },
    { source: "feed-3", target: "collector", rate: 50, label: "50/m" },
    { source: "feed-4", target: "collector", rate: 400, label: "400/m" },
    { source: "collector", target: "final", rate: 900, label: "900/m" },
  ];

  // ── Story 4: Custom band colors ──
  const colorNodes = [
    { id: "ore-a", label: "Ore Type A", variant: "raw" },
    { id: "ore-b", label: "Ore Type B", variant: "raw" },
    { id: "plate-a", label: "Plate A" },
    { id: "plate-b", label: "Plate B" },
    { id: "circuit", label: "Circuit" },
  ];
  const colorEdges = [
    { source: "ore-a", target: "plate-a", rate: 180, color: "#7a9ab8" },
    { source: "ore-b", target: "plate-b", rate: 200, color: "#d4874e" },
    { source: "plate-a", target: "circuit", rate: 90, color: "#7a9ab8" },
    { source: "plate-b", target: "circuit", rate: 135, color: "#d4874e" },
  ];
</script>

<Story name="LinearChain">
  <Panel>
    <Section title="Linear Flow">
      <FlowChart nodes={linearNodes} edges={linearEdges} />
    </Section>
  </Panel>
</Story>

<Story name="BranchingTree">
  <Panel>
    <Section title="Branching: Two Inputs Merge">
      <FlowChart nodes={branchNodes} edges={branchEdges} />
    </Section>
  </Panel>
</Story>

<Story name="HighFanIn">
  <Panel>
    <Section title="High Fan-In: Four Inputs">
      <FlowChart nodes={fanInNodes} edges={fanInEdges} />
    </Section>
  </Panel>
</Story>

<Story name="CustomBandColors">
  <Panel>
    <Section title="Item-Colored Bands">
      <FlowChart nodes={colorNodes} edges={colorEdges} />
    </Section>
  </Panel>
</Story>
