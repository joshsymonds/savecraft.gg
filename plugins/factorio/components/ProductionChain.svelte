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

  export interface ExistingInfo {
    machine_type: string;
    count: number;
    modules: Record<string, number>;
    effective_rate: number;
    actual_rate: number;
  }

  export interface Bottleneck {
    item: string;
    recipe: string;
    needed_rate: number;
    existing_rate: number;
    actual_rate: number;
    diagnosis: string;
  }

  export interface ProductionStage {
    id: string;
    item: string;
    recipe: string;
    machine_type?: string;
    machine_count?: number;
    rate_per_min?: number;
    belt_tier?: string;
    power_kw?: number;
    // Comparison fields — only present when existing_machines was provided
    existing?: ExistingInfo;
    deficit_rate?: number;
    status?: "missing" | "deficit" | "surplus" | "sufficient";
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
    /** Bottlenecks from ratio_calculator comparison (optional) */
    bottlenecks?: Bottleneck[];
    /** Base URL for sprite sheets */
    spriteBaseUrl?: string;
  }

  let { stages, flows, bottlenecks, spriteBaseUrl = "/plugins/factorio/sprites" }: Props = $props();

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

      // Map comparison status to FlowChart variant (takes precedence over ambiguous)
      let variant: "default" | "bottleneck" | "surplus" | "raw" = "default";
      if (isRaw) variant = "raw";
      else if (stage.status === "deficit" || stage.status === "missing") variant = "bottleneck";
      else if (stage.status === "surplus") variant = "surplus";
      else if (isAmbiguous) variant = "bottleneck";

      nodes.push({
        id: stage.id,
        label: stage.item,
        data: {
          name: stage.item,
          machineName: stage.machine_type,
          machineCount: stage.machine_count,
          modules: [],
          ratePerMin: stage.rate_per_min,
          // Comparison data (optional)
          existing: stage.existing,
          status: stage.status,
          deficitRate: stage.deficit_rate,
        },
        variant,
      });
    }

    for (const flow of flowList) {
      edges.push({
        source: flow.source,
        target: flow.target,
        rate: flow.rate_per_min,
        label: flow.item,
        color: getItemColor(flow.item),
      });
    }

    return { nodes, edges };
  }

  function formatName(name: string): string {
    return name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  function productionBandLabel(edge: FlowEdge, _position: "source" | "target"): string | null {
    if (!edge.label) return null;
    return `${Math.round(edge.rate)}/m ${formatName(edge.label)}`;
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
      bandLabel={productionBandLabel}
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
        {#if d.status}
          {@const existing = d.existing as { count: number; machine_type: string } | undefined}
          <div class="comparison-bar">
            {#if d.status === "missing"}
              <span class="status-badge status-missing">Not built</span>
            {:else if d.status === "deficit"}
              <span class="status-badge status-deficit">
                {existing?.count ?? 0} / {d.machineCount as number} needed
              </span>
            {:else if d.status === "surplus"}
              <span class="status-badge status-surplus">
                {existing?.count ?? 0} / {d.machineCount as number} needed
              </span>
            {:else}
              <span class="status-badge status-ok">
                {existing?.count ?? 0} / {d.machineCount as number} needed
              </span>
            {/if}
          </div>
        {/if}
      {/snippet}
    </FlowChart>
  </div>

  {#if bottlenecks && bottlenecks.length > 0}
    <div class="bottleneck-bar">
      <span class="bottleneck-label">Bottlenecks:</span>
      {#each bottlenecks as bn}
        <span class="bottleneck-item">
          {formatName(bn.item)}
          <span class="bottleneck-diagnosis">({bn.diagnosis})</span>
        </span>
      {/each}
    </div>
  {/if}
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

  /* Comparison bar inside machine nodes */
  .comparison-bar {
    padding: 2px 12px 4px;
    font-size: 12px;
    font-family: var(--font-heading, sans-serif);
  }

  .status-badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .status-missing {
    color: var(--color-negative, #e85a5a);
    background: color-mix(in srgb, #e85a5a 12%, transparent);
  }

  .status-deficit {
    color: var(--color-negative, #e85a5a);
    background: color-mix(in srgb, #e85a5a 12%, transparent);
  }

  .status-surplus {
    color: var(--color-positive, #5abe8a);
    background: color-mix(in srgb, #5abe8a 12%, transparent);
  }

  .status-ok {
    color: var(--color-text-muted, #a0a8cc);
    background: color-mix(in srgb, #a0a8cc 10%, transparent);
  }

  /* Bottleneck summary bar */
  .bottleneck-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    font-size: 13px;
    color: var(--color-text, #e8e0d0);
    font-family: var(--font-heading, sans-serif);
    background: color-mix(in srgb, #e85a5a 8%, transparent);
    border-top: 1px solid color-mix(in srgb, #e85a5a 20%, transparent);
  }

  .bottleneck-label {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-negative, #e85a5a);
  }

  .bottleneck-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .bottleneck-diagnosis {
    color: var(--color-text-muted, #a0a8cc);
    font-size: 12px;
  }
</style>
