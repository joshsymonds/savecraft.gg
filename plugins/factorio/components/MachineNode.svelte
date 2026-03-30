<!--
  @component
  Factorio machine node card for use inside FlowChart/ProductionChain.
  Shows item icon, machine count/type, module slot indicators, and rate badge.

  @attribution wube
-->
<script lang="ts">
  import FactorioIcon from "../../../views/src/components/factorio/FactorioIcon.svelte";
  import type { SpriteConfig } from "../../../views/src/components/factorio/factorio-icons";
  import { getModuleColor, getModuleLabel, getBeltTierColor } from "./factorio-colors";

  interface Props {
    /** Item internal name (e.g., "iron-plate") */
    name: string;
    /** Machine type internal name (e.g., "assembling-machine-2") */
    machineName?: string;
    /** Number of machines needed */
    machineCount?: number;
    /** Number of module slots available on this machine (0-4) */
    moduleSlots?: number;
    /** Equipped modules by internal name */
    modules?: string[];
    /** Production rate in items/min */
    ratePerMin?: number;
    /** Belt tier for rate badge dot */
    beltTier?: string;
    /** Node variant (styling handled by parent FlowChart node) */
    variant?: "default" | "bottleneck" | "surplus" | "raw";
    /** Sprite config for FactorioIcon */
    spriteConfig?: SpriteConfig | null;
  }

  let {
    name,
    machineName,
    machineCount,
    moduleSlots = 0,
    modules = [],
    ratePerMin,
    beltTier,
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

  // Build module slot display: filled slots first, then empty outlines
  let moduleDisplay = $derived.by(() => {
    if (moduleSlots <= 0 && modules.length === 0) return [];
    const totalSlots = Math.max(moduleSlots, modules.length);
    const slots: Array<{ filled: boolean; color: string; label: string }> = [];
    for (let i = 0; i < totalSlots; i++) {
      if (i < modules.length) {
        slots.push({
          filled: true,
          color: getModuleColor(modules[i]),
          label: getModuleLabel(modules[i]),
        });
      } else {
        slots.push({ filled: false, color: "transparent", label: "" });
      }
    }
    return slots;
  });

  let rateText = $derived(
    ratePerMin !== undefined ? `${ratePerMin}/m` : undefined,
  );

  let beltColor = $derived(beltTier ? getBeltTierColor(beltTier) : undefined);
</script>

<div class="machine-node">
  <div class="node-icon">
    <FactorioIcon {name} size={32} {spriteConfig} />
  </div>

  <div class="node-body">
    <span class="item-name">{formattedName}</span>
    {#if isRaw}
      <span class="machine-info raw-label">Raw resource</span>
    {:else if machineLabel}
      <span class="machine-info">{machineLabel}</span>
    {/if}

    {#if moduleDisplay.length > 0}
      <div class="module-slots">
        {#each moduleDisplay as slot}
          {#if slot.filled}
            <span
              class="module-slot filled"
              style:background-color={slot.color}
              title={slot.label}
            >{slot.label}</span>
          {:else}
            <span class="module-slot empty"></span>
          {/if}
        {/each}
      </div>
    {/if}
  </div>

  {#if rateText}
    <div class="rate-area">
      <span class="rate-value">{rateText}</span>
      {#if beltColor}
        <span class="belt-dot" style:background-color={beltColor}></span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .machine-node {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    width: 100%;
    height: 100%;
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
    gap: 1px;
  }

  .item-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text, #e8e0d0);
    font-family: var(--font-heading, sans-serif);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }

  .machine-info {
    font-size: 11px;
    font-weight: 500;
    color: var(--color-text-muted, #a0a8cc);
    font-family: var(--font-body, sans-serif);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
  }

  .raw-label {
    font-style: italic;
    opacity: 0.7;
  }

  /* ── Module slots ── */

  .module-slots {
    display: flex;
    gap: 3px;
    margin-top: 2px;
  }

  .module-slot {
    width: 16px;
    height: 16px;
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    font-weight: 700;
    font-family: var(--font-heading, monospace);
    color: rgba(0, 0, 0, 0.8);
    line-height: 1;
  }

  .module-slot.filled {
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .module-slot.empty {
    border: 1px dashed var(--color-text-muted, #a0a8cc);
    opacity: 0.4;
  }

  /* ── Rate area ── */

  .rate-area {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .rate-value {
    font-size: 11px;
    font-weight: 700;
    color: var(--color-gold, #c8a84e);
    font-family: var(--font-heading, monospace);
    white-space: nowrap;
  }

  .belt-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }
</style>
