<!--
  @component
  Factorio production chain visualization. Wraps FlowChart with
  MachineNode content and item-colored flow bands.

  Accepts the DAG output (stages + flows) from ratio_calculator.go
  directly and handles conversion to FlowNode/FlowEdge internally.

  @attribution wube
-->
<script lang="ts">
  import FlowChart from "../../../views/src/components/charts/FlowChart.svelte";
  import type { FlowNode, FlowEdge } from "../../../views/src/components/charts/FlowChart.svelte";
  import MachineNode from "./MachineNode.svelte";
  import { getItemColor } from "./factorio-colors";
  import type { SpriteConfig } from "../../../views/src/components/factorio/factorio-icons";

  import itemManifest from "../sprites/items.json";
  import fluidManifest from "../sprites/fluids.json";

  export interface ProductionStage {
    id: string;
    item: string;
    recipe: string;
    machine_type?: string;
    machine_count?: number;
    rate_per_min?: number;
    belt_tier?: string;
    power_kw?: number;
  }

  export interface ProductionFlow {
    source: string;
    target: string;
    item: string;
    rate_per_min: number;
  }

  interface Props {
    /** Production stages from ratio_calculator.go */
    stages: ProductionStage[];
    /** Production flows from ratio_calculator.go */
    flows: ProductionFlow[];
    /** Base URL for sprite sheets */
    spriteBaseUrl?: string;
  }

  let { stages, flows, spriteBaseUrl = "/plugins/factorio/sprites" }: Props = $props();

  // Sprite configs
  let itemSpriteConfig: SpriteConfig = $derived({
    url: `${spriteBaseUrl}/items.png`,
    sheetWidth: 2048,
    sheetHeight: 704,
    manifest: itemManifest,
  });

  let fluidSpriteConfig: SpriteConfig = $derived({
    url: `${spriteBaseUrl}/fluids.png`,
    sheetWidth: 2048,
    sheetHeight: 128,
    manifest: fluidManifest,
  });

  function getSpriteConfig(iconName: string): SpriteConfig {
    if (fluidManifest[iconName as keyof typeof fluidManifest]) return fluidSpriteConfig;
    return itemSpriteConfig;
  }

  /** Convert ratio_calculator DAG into FlowChart nodes + edges. */
  function buildGraph(
    stageList: ProductionStage[],
    flowList: ProductionFlow[],
  ): { nodes: FlowNode[]; edges: FlowEdge[] } {
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];

    for (const stage of stageList) {
      const isRaw = stage.recipe === "(raw)" || stage.recipe === "(no recipe)";
      const isAmbiguous = stage.recipe?.startsWith("(ambiguous");

      nodes.push({
        id: stage.id,
        label: stage.item,
        data: {
          name: stage.item,
          machineName: stage.machine_type,
          machineCount: stage.machine_count,
          modules: [],
          ratePerMin: stage.rate_per_min,
        },
        variant: isRaw ? "raw" : isAmbiguous ? "bottleneck" : "default",
      });
    }

    for (const flow of flowList) {
      edges.push({
        source: flow.source,
        target: flow.target,
        rate: flow.rate_per_min,
        color: getItemColor(flow.item),
      });
    }

    return { nodes, edges };
  }

  let chartData = $derived(buildGraph(stages, flows));
</script>

<div class="production-chain">
  <div class="chart-wrapper">
    <FlowChart
      nodes={chartData.nodes}
      edges={chartData.edges}
      nodeWidth={280}
      minNodeHeight={70}
    >
      {#snippet nodeContent(node: FlowNode, _dims: { width: number; height: number })}
        {@const d = (node.data ?? {}) as Record<string, unknown>}
        <MachineNode
          name={d.name as string}
          machineName={d.machineName as string | undefined}
          machineCount={d.machineCount as number | undefined}
          modules={(d.modules as string[]) ?? []}
          ratePerMin={d.ratePerMin as number | undefined}
          variant={node.variant}
          spriteConfig={getSpriteConfig(d.name as string)}
        />
      {/snippet}
    </FlowChart>
  </div>
</div>

<style>
  .production-chain {
    /* Factorio aesthetic: warm amber on dark */
    --flow-node-bg: #1a1a1a;
    --flow-node-border: #8a6a2a;
  }

  .chart-wrapper {
    padding: 4px 0;
    position: relative;
  }

  .chart-wrapper::after {
    content: "";
    position: absolute;
    inset: 0;
    background: url("/plugins/factorio/icon.png") center / 120px no-repeat;
    opacity: 0.06;
    pointer-events: none;
  }
</style>
