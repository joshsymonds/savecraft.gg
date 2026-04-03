<!--
  @component
  Horizontal bar chart with labels and values.
  Used for win rates by format, resistance values, stat comparisons.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import Tooltip from "./Tooltip.svelte";

  type Variant = "positive" | "negative" | "highlight" | "info" | "warning" | "muted";

  interface Item {
    label: string;
    value: number;
    variant?: Variant;
    /** Opaque key passed to the icon snippet (e.g. an internal ID for icon lookup) */
    key?: string;
  }

  interface Props {
    /** Bar items */
    items: Item[];
    /** Explicit max value (defaults to max of items) */
    maxValue?: number;
    /** Optional snippet to render an icon before each bar label. Receives the item. */
    icon?: Snippet<[Item]>;
  }

  let { items, maxValue, icon }: Props = $props();

  let tip = $state({ text: "", x: 0, y: 0, visible: false });

  function showTip(e: MouseEvent, item: Item) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const parent = (e.currentTarget as HTMLElement).closest(".bar-chart")!.getBoundingClientRect();
    tip = { text: `${item.label}: ${item.value}`, x: e.clientX - parent.left, y: rect.top - parent.top, visible: true };
  }

  function hideTip() { tip.visible = false; }

  const variantColors: Record<Variant, string> = {
    positive: "var(--color-positive)",
    negative: "var(--color-negative)",
    highlight: "var(--color-highlight)",
    info: "var(--color-info)",
    warning: "var(--color-warning)",
    muted: "var(--color-text-muted)",
  };

  let max = $derived(maxValue ?? Math.max(...items.map((d) => d.value), 1));
</script>

<div class="bar-chart" style="position: relative;">
  <Tooltip {...tip} />
  {#each items as item, i}
    <div class="bar-row" style:animation-delay="{i * 50}ms" onmouseenter={(e) => showTip(e, item)} onmouseleave={hideTip}>
      <span class="bar-label">{#if icon}{@render icon(item)}{/if}{item.label}</span>
      <div class="bar-track">
        <div
          class="bar-fill"
          style:width="{(item.value / max) * 100}%"
          style:background={item.variant ? variantColors[item.variant] : "var(--color-info)"}
        ></div>
      </div>
      <span class="bar-value">{item.value}</span>
    </div>
  {/each}
</div>

<style>
  .bar-chart {
    display: flex;
    flex-direction: column;
  }

  .bar-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-xs);
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
    animation: bar-enter 0.4s cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  .bar-row:last-child {
    border-bottom: none;
  }

  .bar-row:nth-child(even) {
    background: color-mix(in srgb, var(--color-border) 8%, transparent);
  }

  .bar-row:hover {
    background: color-mix(in srgb, var(--color-border) 14%, transparent);
  }

  .bar-label {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text);
    min-width: 100px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs, 4px);
  }

  .bar-track {
    flex: 1;
    height: 14px;
    background: color-mix(in srgb, var(--color-border) 15%, transparent);
    border-radius: 99px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 99px;
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    min-width: 2px;
  }

  .bar-value {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 700;
    color: var(--color-text);
    min-width: 40px;
    text-align: right;
  }

  @keyframes bar-enter {
    from {
      opacity: 0;
      transform: translateX(-8px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
</style>
