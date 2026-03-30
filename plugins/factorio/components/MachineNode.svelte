<!--
  @component
  Factorio machine node card for use inside FlowChart/ProductionChain.
  Shows item icon, machine count/type, module icons, and rate.

  @attribution wube
-->
<script lang="ts">
  import FactorioIcon from "../../../views/src/components/factorio/FactorioIcon.svelte";
  import type { SpriteConfig } from "../../../views/src/components/factorio/factorio-icons";

  interface Props {
    /** Item internal name (e.g., "iron-plate") */
    name: string;
    /** Machine type internal name (e.g., "assembling-machine-2") */
    machineName?: string;
    /** Number of machines needed */
    machineCount?: number;
    /** Equipped modules by internal name */
    modules?: string[];
    /** Production rate in items/min */
    ratePerMin?: number;
    /** Node variant (styling handled by parent FlowChart node) */
    variant?: "default" | "bottleneck" | "surplus" | "raw";
    /** Sprite config for item icons */
    spriteConfig?: SpriteConfig | null;
  }

  let {
    name,
    machineName,
    machineCount,
    modules = [],
    ratePerMin,
    variant = "default",
    spriteConfig = null,
  }: Props = $props();

  let isRaw = $derived(variant === "raw");

  let formattedName = $derived(
    name
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
  );

  let machineLabel = $derived.by(() => {
    if (!machineName || !machineCount) return "";
    const short: Record<string, string> = {
      "assembling-machine-1": "AM1",
      "assembling-machine-2": "AM2",
      "assembling-machine-3": "AM3",
      "chemical-plant": "Chem Plant",
      "oil-refinery": "Refinery",
      "stone-furnace": "Furnace",
      "steel-furnace": "Steel Furnace",
      "electric-furnace": "E-Furnace",
      "electric-mining-drill": "E-Drill",
      "foundry": "Foundry",
      "electromagnetic-plant": "EM Plant",
      "biochamber": "Biochamber",
      "cryogenic-plant": "Cryo Plant",
    };
    const shortName = short[machineName] ?? machineName.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return `\u00d7${machineCount} ${shortName}`;
  });

  let rateText = $derived(
    ratePerMin !== undefined ? `${ratePerMin}/m` : undefined,
  );
</script>

<div class="machine-node">
  <div class="node-icon">
    <FactorioIcon {name} size={40} {spriteConfig} />
  </div>

  <div class="node-body">
    <span class="item-name">{formattedName}</span>
    {#if isRaw}
      <span class="machine-info raw-label">Raw resource</span>
    {:else if machineLabel}
      <span class="machine-info">{machineLabel}</span>
    {/if}

    {#if modules.length > 0}
      <div class="module-icons">
        {#each modules as mod}
          <FactorioIcon name={mod} size={22} {spriteConfig} />
        {/each}
      </div>
    {/if}
  </div>

  {#if rateText}
    <span class="rate-value">{rateText}</span>
  {/if}
</div>

<style>
  .machine-node {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 10px;
    width: 100%;
    box-sizing: border-box;
  }

  /* ── Icon ── */

  .node-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Body ── */

  .node-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text, #e8e0d0);
    font-family: var(--font-heading, sans-serif);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }

  .machine-info {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-muted, #a0a8cc);
    font-family: var(--font-body, sans-serif);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }

  .raw-label {
    font-style: italic;
    opacity: 0.7;
  }

  /* ── Module icons ── */

  .module-icons {
    display: flex;
    gap: 2px;
    margin-top: 2px;
  }

  /* ── Rate ── */

  .rate-value {
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--color-gold, #c8a84e);
    font-family: var(--font-heading, monospace);
    white-space: nowrap;
  }
</style>
