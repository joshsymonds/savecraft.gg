<!--
  @component
  Legend with color swatches and labels.
  Used alongside RadarChart (multi-series), StackedBar, any multi-color chart.
-->
<script lang="ts">
  interface LegendItem {
    label: string;
    color: string;
  }

  interface Props {
    /** Legend entries */
    items: LegendItem[];
    /** Layout direction (default: "horizontal") */
    layout?: "horizontal" | "vertical";
  }

  let { items, layout = "horizontal" }: Props = $props();
</script>

<div
  class="legend-bar"
  style:--legend-direction={layout === "vertical" ? "column" : "row"}
>
  <span class="legend-title">Legend</span>
  <div class="legend-entries">
    {#each items as item}
      <div class="legend-entry">
        <span class="legend-swatch" style:background={item.color} style:--swatch-color={item.color}></span>
        <span class="legend-label">{item.label}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .legend-bar {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    background: color-mix(in srgb, var(--color-border) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
    border-radius: var(--radius-md);
    padding: var(--space-xs) var(--space-sm);
  }

  .legend-title {
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    flex-shrink: 0;
    opacity: 0.6;
  }

  .legend-entries {
    display: flex;
    flex-direction: var(--legend-direction);
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-lg);
  }

  .legend-entry {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legend-swatch {
    width: 14px;
    height: 14px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    box-shadow:
      0 0 6px color-mix(in srgb, var(--swatch-color, currentColor) 60%, transparent),
      0 0 12px color-mix(in srgb, var(--swatch-color, currentColor) 30%, transparent),
      inset 0 1px 2px rgba(255, 255, 255, 0.2);
    border: 1px solid color-mix(in srgb, var(--swatch-color, currentColor) 70%, transparent);
  }

  .legend-label {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-dim);
  }
</style>
