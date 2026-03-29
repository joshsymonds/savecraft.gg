<!--
  @component
  Factorio ratio calculator reference view.
  Renders the production dependency tree as a ProductionDAG with
  FactorioIcon sprites, raw materials summary, and configuration details.

  @attribution wube
-->
<script lang="ts">
  import ProductionDAG from "../../../../views/src/components/charts/ProductionDAG.svelte";
  import FactorioIcon from "../../../../views/src/components/factorio/FactorioIcon.svelte";
  import DataTable from "../../../../views/src/components/data/DataTable.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import type { DAGNode, DAGEdge } from "../../../../views/src/components/charts/ProductionDAG.svelte";
  import type { SpriteConfig } from "../../../../views/src/components/factorio/factorio-icons";

  // Import manifests at build time
  import itemManifest from "../../../../plugins/factorio/sprites/items.json";
  import fluidManifest from "../../../../plugins/factorio/sprites/fluids.json";

  interface TreeNode {
    item: string;
    recipe: string;
    machines?: number;
    machine_type?: string;
    rate_per_min?: number;
    belt_tier?: string;
    power_kw?: number;
    children?: TreeNode[];
  }

  interface RawMaterial {
    item: string;
    rate_per_min: number;
    belt_tier: string;
  }

  interface Props {
    data: {
      production_tree: TreeNode;
      raw_materials: RawMaterial[];
      total_power_kw: number;
      config: {
        assembler_tier: string;
        modules: string[] | null;
        beacon_count: number;
        beacon_modules: string[] | null;
      };
    };
    /** Base URL for sprite sheets (e.g., R2 URL or Storybook static path) */
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

  // Flatten the nested tree into DAG nodes + edges
  function flattenTree(tree: TreeNode): { nodes: DAGNode[]; edges: DAGEdge[] } {
    const nodes: DAGNode[] = [];
    const edges: DAGEdge[] = [];
    let idCounter = 0;

    function walk(node: TreeNode, parentId: string | null): string {
      const id = `n${idCounter++}`;
      const isRaw = node.recipe === "(raw)" || node.recipe === "(no recipe)";
      const isAmbiguous = node.recipe?.startsWith("(ambiguous");

      let sublabel = "";
      if (node.machines && node.machine_type) {
        sublabel = `\u00d7${node.machines} ${formatMachineName(node.machine_type)}`;
      } else if (isRaw) {
        sublabel = "Raw resource";
      } else if (isAmbiguous) {
        sublabel = "Needs recipe selection";
      }

      nodes.push({
        id,
        label: formatItemName(node.item),
        sublabel,
        icon: node.item,
        rate: node.rate_per_min ? `${node.rate_per_min}/m` : undefined,
        variant: isRaw ? "raw" : isAmbiguous ? "bottleneck" : "default",
      });

      if (parentId) {
        edges.push({
          source: id,
          target: parentId,
          rate: node.rate_per_min,
        });
      }

      if (node.children) {
        for (const child of node.children) {
          walk(child, id);
        }
      }

      return id;
    }

    walk(tree, null);
    return { nodes, edges };
  }

  function formatItemName(name: string): string {
    return name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  function formatMachineName(name: string): string {
    const short: Record<string, string> = {
      "assembling-machine-1": "AM1",
      "assembling-machine-2": "AM2",
      "assembling-machine-3": "AM3",
      "chemical-plant": "Chem Plant",
      "oil-refinery": "Refinery",
      "stone-furnace": "Furnace",
      "steel-furnace": "Steel Furnace",
      "electric-furnace": "E-Furnace",
    };
    return short[name] ?? formatItemName(name);
  }

  function formatPower(kw: number): string {
    if (kw >= 1000) return `${(kw / 1000).toFixed(1)} MW`;
    return `${kw.toFixed(0)} kW`;
  }

  let dagData = $derived(flattenTree(data.production_tree));

  let rawTableColumns = $derived([
    { key: "item", label: "Resource" },
    { key: "rate", label: "Rate", align: "right" as const },
    { key: "belt", label: "Belt" },
  ]);

  let rawTableRows = $derived(
    (data.raw_materials ?? []).map((r) => ({
      item: formatItemName(r.item),
      rate: `${r.rate_per_min}/min`,
      belt: r.belt_tier ? `${r.belt_tier.charAt(0).toUpperCase()}${r.belt_tier.slice(1)}` : "\u2014",
    }))
  );

  let configItems = $derived.by(() => {
    const items: Array<{ label: string; value: string }> = [
      { label: "Assembler", value: formatMachineName(data.config.assembler_tier) },
    ];
    if (data.config.modules?.length) {
      items.push({ label: "Modules", value: data.config.modules.map(formatItemName).join(", ") });
    }
    if (data.config.beacon_count > 0) {
      items.push({ label: "Beacons", value: `${data.config.beacon_count}\u00d7` });
      if (data.config.beacon_modules?.length) {
        items.push({ label: "Beacon Modules", value: data.config.beacon_modules.map(formatItemName).join(", ") });
      }
    }
    items.push({ label: "Total Power", value: formatPower(data.total_power_kw) });
    return items;
  });
</script>

<div class="factorio-view">
  <Panel>
    <Section title="Production Chain">
      <div class="dag-wrapper">
        <ProductionDAG nodes={dagData.nodes} edges={dagData.edges}>
          {#snippet nodeIcon(iconName: string)}
            <FactorioIcon name={iconName} size={32} spriteConfig={getSpriteConfig(iconName)} />
          {/snippet}
        </ProductionDAG>
      </div>
    </Section>

    {#if rawTableRows.length > 0}
      <Section title="Raw Materials">
        <DataTable columns={rawTableColumns} rows={rawTableRows} />
      </Section>
    {/if}

    <Section title="Configuration">
      {#each configItems as item}
        <KeyValue label={item.label} value={item.value} />
      {/each}
    </Section>
  </Panel>
</div>

<style>
  .factorio-view {
    /* Factorio aesthetic: warm gray-brown background, amber accents */
    --dag-node-bg: #1a1a1a;
    --dag-node-border: #8a6a2a;
    --dag-node-bg-bottleneck: rgba(232, 90, 90, 0.12);
    --dag-node-bg-surplus: rgba(90, 190, 138, 0.08);
    --dag-edge-color: #c8a84e;
    --dag-rate-color: #e8b830;
    --dag-sublabel-color: #c0b898;
  }

  .dag-wrapper {
    overflow-x: auto;
    padding: 8px 0;
  }
</style>
