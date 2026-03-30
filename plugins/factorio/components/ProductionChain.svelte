<!--
  @component
  Factorio production chain visualization. Wraps FlowChart with
  MachineNode content and item-colored flow bands.

  Accepts the production_tree structure from ratio_calculator.go
  directly and handles tree→FlowNode/FlowEdge conversion internally.

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

  export interface TreeNode {
    item: string;
    recipe: string;
    machines?: number;
    machine_type?: string;
    modules?: string[];
    rate_per_min?: number;
    belt_tier?: string;
    power_kw?: number;
    children?: TreeNode[];
  }

  interface Props {
    /** Production tree from ratio_calculator.go */
    tree: TreeNode;
    /** Base URL for sprite sheets */
    spriteBaseUrl?: string;
  }

  let { tree, spriteBaseUrl = "/plugins/factorio/sprites" }: Props = $props();

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

  // Flatten tree into FlowChart nodes + edges
  function flattenTree(root: TreeNode): { nodes: FlowNode[]; edges: FlowEdge[] } {
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    let idCounter = 0;

    function walk(node: TreeNode, parentId: string | null): string {
      const id = `n${idCounter++}`;
      const isRaw = node.recipe === "(raw)" || node.recipe === "(no recipe)";
      const isAmbiguous = node.recipe?.startsWith("(ambiguous");

      nodes.push({
        id,
        label: node.item,
        data: {
          name: node.item,
          machineName: node.machine_type,
          machineCount: node.machines,
          modules: node.modules ?? [],
          ratePerMin: node.rate_per_min,
        },
        variant: isRaw ? "raw" : isAmbiguous ? "bottleneck" : "default",
      });

      if (parentId) {
        edges.push({
          source: id,
          target: parentId,
          rate: node.rate_per_min ?? 0,
          color: getItemColor(node.item),
        });
      }

      if (node.children) {
        for (const child of node.children) {
          walk(child, id);
        }
      }

      return id;
    }

    walk(root, null);
    return { nodes, edges };
  }

  let chartData = $derived(flattenTree(tree));
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
  }
</style>
