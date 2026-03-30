<!--
  @component
  Factorio oil processing flow visualization. Wraps FlowChart with
  MachineNode content and fluid-colored flow bands.

  Accepts the oil_balancer output (stages + flows DAG) directly and
  handles conversion to FlowNode/FlowEdge internally.

  @attribution wube
-->
<script lang="ts">
  import FlowChart from "../../../views/src/components/charts/FlowChart.svelte";
  import type { FlowNode, FlowEdge } from "../../../views/src/components/charts/FlowChart.svelte";
  import MachineNode from "./MachineNode.svelte";
  import { getItemColor } from "./factorio-colors";
  import type { SpriteConfig } from "../../../views/src/components/factorio/factorio-icons";
  import type { OilBalancerResult } from "./oil-fixtures";

  import itemManifest from "../sprites/items.json";
  import fluidManifest from "../sprites/fluids.json";

  interface Props {
    /** Oil balancer result from oil_balancer.go */
    data: OilBalancerResult;
    /** Base URL for sprite sheets */
    spriteBaseUrl?: string;
  }

  let { data, spriteBaseUrl = "/plugins/factorio/sprites" }: Props = $props();

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

  /** Convert oil_balancer DAG into FlowChart nodes + edges. */
  function buildGraph(result: OilBalancerResult): { nodes: FlowNode[]; edges: FlowEdge[] } {
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];

    // Collect output flows for pseudo-nodes
    const outputFluids = new Set<string>();
    for (const flow of result.flows) {
      if (flow.target === "output") outputFluids.add(flow.fluid);
    }

    // One input node per fluid — bands split from it to all consumers
    const inputByFluid = new Map<string, { id: string; totalRate: number }>();
    for (const flow of result.flows) {
      if (flow.source !== "input") continue;
      if (!inputByFluid.has(flow.fluid)) {
        const nodeId = `input-${flow.fluid}`;
        inputByFluid.set(flow.fluid, { id: nodeId, totalRate: 0 });
      }
      inputByFluid.get(flow.fluid)!.totalRate += flow.rate;
    }
    for (const [fluid, { id, totalRate }] of inputByFluid) {
      nodes.push({
        id,
        label: fluid,
        data: {
          name: fluid,
          isInputNode: true,
          rate: totalRate,
        },
        variant: "raw",
      });
    }

    // Processing stages — show the machine as the primary identity
    for (const stage of result.stages) {
      // Map comparison status to FlowChart variant
      let variant: "default" | "bottleneck" | "surplus" | "raw" = "default";
      if (stage.status === "deficit" || stage.status === "missing") variant = "bottleneck";
      else if (stage.status === "surplus") variant = "surplus";

      nodes.push({
        id: stage.id,
        label: stage.recipe,
        data: {
          name: stage.machine_type,
          machineName: stage.machine_type,
          machineCount: stage.machine_count,
          modules: (result.config.modules as string[]) ?? [],
          ratePerMin: undefined,
          // Comparison data (optional)
          existing: stage.existing,
          status: stage.status,
          deficitRate: stage.deficit_rate,
        },
        variant,
      });
    }

    // Output pseudo-node (target products)
    if (outputFluids.size > 0) {
      const outputNames = [...outputFluids].sort();
      nodes.push({
        id: "output",
        label: "Products",
        data: {
          name: outputNames[0],
          isOutputNode: true,
          fluids: outputNames,
        },
        variant: "surplus",
      });
    }

    // Flows → edges with fluid colors
    for (const flow of result.flows) {
      const source = flow.source === "input"
        ? inputByFluid.get(flow.fluid)?.id ?? flow.source
        : flow.source;
      edges.push({
        source,
        target: flow.target,
        rate: flow.rate,
        label: flow.fluid,
        color: getItemColor(flow.fluid),
      });
    }

    return { nodes, edges };
  }

  function formatName(name: string): string {
    return name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  function oilBandLabel(edge: FlowEdge, _position: "source" | "target"): string | null {
    if (!edge.label) return null;
    const name = formatName(edge.label);
    return `${Math.round(edge.rate)} ${name}`;
  }

  let chartData = $derived(buildGraph(data));
</script>

<div class="oil-chain">
  <div class="chart-wrapper">
    <FlowChart
      nodes={chartData.nodes}
      edges={chartData.edges}
      nodeWidth={280}
      minNodeHeight={70}
      bandLabel={oilBandLabel}
    >
      {#snippet nodeContent(node: FlowNode, _dims: { width: number; height: number })}
        {@const d = (node.data ?? {}) as Record<string, unknown>}
        {#if d.isInputNode}
          <div class="pseudo-node input-node">
            <div class="pseudo-fluid">
              <span class="fluid-dot" style:background={getItemColor(d.name as string)}></span>
              <span class="fluid-name">{formatName(d.name as string)}</span>
              {#if d.rate}
                <span class="fluid-rate">{d.rate}/s</span>
              {/if}
            </div>
          </div>
        {:else if d.isOutputNode}
          <div class="pseudo-node output-node">
            <div class="pseudo-label">Products</div>
            {#each (d.fluids as string[]) as fluid}
              <div class="pseudo-fluid">
                <span class="fluid-dot" style:background={getItemColor(fluid)}></span>
                <span class="fluid-name">{formatName(fluid)}</span>
              </div>
            {/each}
          </div>
        {:else}
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
            <!-- Oil stages have fractional machine_count (float64), so ceil for display -->
            {@const existing = d.existing as { count: number; machine_type: string } | undefined}
            <div class="comparison-bar">
              {#if d.status === "missing"}
                <span class="status-badge status-missing">Not built</span>
              {:else if d.status === "deficit"}
                <span class="status-badge status-deficit">
                  {existing?.count ?? 0} / {Math.ceil(d.machineCount as number)} needed
                </span>
              {:else if d.status === "surplus"}
                <span class="status-badge status-surplus">
                  {existing?.count ?? 0} / {Math.ceil(d.machineCount as number)} needed
                </span>
              {:else}
                <span class="status-badge status-ok">
                  {existing?.count ?? 0} / {Math.ceil(d.machineCount as number)} needed
                </span>
              {/if}
            </div>
          {/if}
        {/if}
      {/snippet}
    </FlowChart>
  </div>

  {#if data.bottlenecks && data.bottlenecks.length > 0}
    <div class="bottleneck-bar">
      <span class="bottleneck-label">Bottlenecks:</span>
      {#each data.bottlenecks as bn}
        <span class="bottleneck-item">
          {formatName(bn.recipe)}
          <span class="bottleneck-diagnosis">({bn.diagnosis})</span>
        </span>
      {/each}
    </div>
  {/if}

  {#if Object.keys(data.surplus).length > 0}
    <div class="surplus-bar">
      <span class="surplus-label">Surplus:</span>
      {#each Object.entries(data.surplus) as [fluid, rate]}
        <span class="surplus-item">
          <span class="fluid-dot" style:background={getItemColor(fluid)}></span>
          {formatName(fluid)} +{rate}/s
        </span>
      {/each}
    </div>
  {/if}

  <div class="power-bar">
    Total power: {(data.total_power_kw / 1000).toFixed(1)} MW
  </div>
</div>

<style>
  .oil-chain {
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

  /* Pseudo-nodes for input/output */
  .pseudo-node {
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .pseudo-label {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted, #a0a8cc);
    font-family: var(--font-heading, sans-serif);
    margin-bottom: 2px;
  }

  .pseudo-fluid {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--color-text, #e8e0d0);
    font-family: var(--font-heading, sans-serif);
  }

  .fluid-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .fluid-name {
    flex: 1;
  }

  .fluid-rate {
    font-weight: 700;
    color: var(--color-gold, #c8a84e);
    font-family: var(--font-heading, monospace);
  }

  /* Surplus + power bars */
  .surplus-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    font-size: 13px;
    color: var(--color-text, #e8e0d0);
    font-family: var(--font-heading, sans-serif);
    background: color-mix(in srgb, #e8c84e 8%, transparent);
    border-top: 1px solid color-mix(in srgb, #e8c84e 20%, transparent);
  }

  .surplus-label {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted, #a0a8cc);
  }

  .surplus-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .power-bar {
    padding: 4px 12px;
    font-size: 12px;
    color: var(--color-text-muted, #a0a8cc);
    font-family: var(--font-heading, sans-serif);
    text-align: right;
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
