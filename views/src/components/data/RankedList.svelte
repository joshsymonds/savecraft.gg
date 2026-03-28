<!--
  @component
  Ordered items with rank number, label, and score.
  Used for draft picks, top cards, cut candidates, drop tables.
-->
<script lang="ts">
  import { slide } from "svelte/transition";
  import Badge from "./Badge.svelte";

  type Variant = "positive" | "negative" | "highlight" | "info" | "warning" | "muted";

  interface Item {
    rank: number;
    label: string;
    sublabel?: string;
    value: string | number;
    variant?: Variant;
    badge?: { label: string; variant: string };
  }

  interface Props {
    /** Ordered items to display */
    items: Item[];
  }

  let { items }: Props = $props();

  const variantColors: Record<Variant, string> = {
    positive: "var(--color-positive)",
    negative: "var(--color-negative)",
    highlight: "var(--color-highlight)",
    info: "var(--color-info)",
    warning: "var(--color-warning)",
    muted: "var(--color-text-muted)",
  };
</script>

<div class="ranked-list">
  {#each items as item, i (item.label)}
    <div class="ranked-item" transition:slide={{ duration: 200 }} style:animation-delay="{i * 60}ms">
      <span class="rank">{item.rank}</span>
      <div class="info">
        <span class="label">{item.label}</span>
        {#if item.sublabel}
          <span class="sublabel">{item.sublabel}</span>
        {/if}
      </div>
      <div class="score">
        <span
          class="value"
          style:color={item.variant ? variantColors[item.variant] : undefined}
        >{item.value}</span>
        {#if item.badge}
          <Badge label={item.badge.label} variant={item.badge.variant} />
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .ranked-list {
    display: flex;
    flex-direction: column;
  }

  .ranked-item {
    display: flex;
    align-items: baseline;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-xs);
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
    animation: row-enter 0.4s cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  .ranked-item:nth-child(even) {
    background: color-mix(in srgb, var(--color-border) 8%, transparent);
  }

  .ranked-item:hover {
    background: color-mix(in srgb, var(--color-border) 14%, transparent);
  }

  @keyframes row-enter {
    from {
      opacity: 0;
      transform: translateX(-8px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .ranked-item:last-child {
    border-bottom: none;
  }

  .rank {
    font-family: var(--font-pixel);
    font-size: 11px;
    color: var(--color-text-muted);
    min-width: 20px;
    text-align: right;
  }

  .info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .label {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sublabel {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .score {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    white-space: nowrap;
  }

  .value {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 700;
    color: var(--color-text);
  }
</style>
