<!--
  @component
  Factorio machine node card for use inside FlowChart/ProductionChain.
  Product icon is the dominant visual (44px). Name + rate on the top line.
  Below: machine count as a bold badge-style number, machine icon, modules.

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
    name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
  );

  let rateText = $derived(ratePerMin !== undefined ? `${ratePerMin}/m` : undefined);
</script>

<div class="node">
  <!-- Product: big icon on the left, name + rate to the right -->
  <div class="product-icon">
    <FactorioIcon {name} size={44} {spriteConfig} />
  </div>

  <div class="info">
    <div class="title-row">
      <span class="product-name">{formattedName}</span>
      {#if rateText}
        <span class="rate">{rateText}</span>
      {/if}
    </div>

    <!-- Machine: count badge + machine icon + modules -->
    {#if !isRaw && machineName && machineCount}
      <div class="machine-row">
        <span class="count">{machineCount}×</span>
        <FactorioIcon name={machineName} size={24} {spriteConfig} />
        {#if modules.length > 0}
          <div class="modules">
            {#each modules as mod}
              <FactorioIcon name={mod} size={20} {spriteConfig} />
            {/each}
          </div>
        {/if}
      </div>
    {:else if isRaw}
      <span class="raw">Raw resource</span>
    {/if}
  </div>
</div>

<style>
  .node {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
  }

  .product-icon {
    flex-shrink: 0;
  }

  /* ── Info column ── */

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .title-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .product-name {
    flex: 1;
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text, #e8e0d0);
    font-family: var(--font-heading, sans-serif);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rate {
    flex-shrink: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--color-gold, #c8a84e);
    font-family: var(--font-heading, monospace);
  }

  /* ── Machine row ── */

  .machine-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .count {
    font-size: 16px;
    font-weight: 700;
    color: var(--color-gold-light, #e8c86e);
    font-family: var(--font-heading, sans-serif);
    line-height: 1;
    letter-spacing: -0.5px;
  }

  .modules {
    display: flex;
    gap: 2px;
    margin-left: 2px;
  }

  .raw {
    font-size: 12px;
    font-style: italic;
    color: var(--color-text-muted, #a0a8cc);
    opacity: 0.7;
  }
</style>
