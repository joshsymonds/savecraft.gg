<!--
  @component
  Displays a linked group of gems (a socket group / skill setup).
  Shows a visual socket chain with diagonal gem names and tooltips on hover.
  Main group is visually highlighted. Disabled groups are dimmed.
-->
<script lang="ts">
  import SocketChain from "./SocketChain.svelte";

  interface Gem {
    name?: string;
    nameSpec?: string;
    level?: number;
    quality?: number;
    qualityId?: string;
    enabled?: boolean;
    support?: boolean;
    vaal?: boolean;
    color?: string;
    socketColor?: string;
    tags?: string;
    description?: string;
    castTime?: number;
    reqStr?: number;
    reqDex?: number;
    reqInt?: number;
    naturalMaxLevel?: number;
    hasGlobalEffect?: boolean;
  }

  interface Props {
    /** Gems in this socket group */
    gems: Gem[];
    /** Group label (e.g. "6L Spark") */
    label?: string;
    /** Slot this group is socketed in (e.g. "Body Armour") */
    slot?: string;
    /** Whether this is the build's main skill group */
    isMainGroup?: boolean;
    /** Whether this group is enabled */
    enabled?: boolean;
  }

  let { gems, label, slot, isMainGroup = false, enabled = true }: Props = $props();

  let activeGems = $derived(gems.filter((g) => g.name || g.nameSpec));
  let displayLabel = $derived(label || slot || "Socket Group");
</script>

<div class="socket-group" class:main={isMainGroup} class:disabled={!enabled}>
  <div class="header">
    <span class="label">{displayLabel}</span>
    {#if slot && label}
      <span class="slot">{slot}</span>
    {/if}
    {#if isMainGroup}
      <span class="main-badge">MAIN</span>
    {/if}
  </div>
  <SocketChain gems={activeGems} {isMainGroup} {enabled} />
</div>

<style>
  .socket-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    border-left: 2px solid var(--color-border);
    transition: border-color 0.2s;
  }

  .socket-group.main {
    border-left-color: var(--color-gold);
    background: color-mix(in srgb, var(--color-gold) 4%, transparent);
  }

  .socket-group.disabled {
    opacity: 0.4;
  }

  .header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .label {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }

  .slot {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .main-badge {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-gold);
    background: color-mix(in srgb, var(--color-gold) 12%, transparent);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    letter-spacing: 1px;
  }
</style>
