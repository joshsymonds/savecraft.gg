<!--
  @component
  Color-intensity grid cells.
  Used for quality tier distributions, win rates by archetype/set, pick quality over time.
-->
<script lang="ts">
  interface Cell {
    value: number;
    label?: string;
  }

  interface Row {
    label: string;
    cells: Cell[];
  }

  interface Props {
    /** Row data with labels and cell values */
    rows: Row[];
    /** Column header labels */
    columnLabels?: string[];
    /** Low value color (default: --color-scale-low) */
    minColor?: string;
    /** High value color (default: --color-scale-high) */
    maxColor?: string;
  }

  let { rows, columnLabels, minColor, maxColor }: Props = $props();

  let allValues = $derived(rows.flatMap((r) => r.cells.map((c) => c.value)));
  let minVal = $derived(Math.min(...allValues));
  let maxVal = $derived(Math.max(...allValues));
  let range = $derived(maxVal - minVal || 1);

  function cellIntensity(value: number): number {
    return (value - minVal) / range;
  }
</script>

<div class="heatmap-wrapper">
  <table class="heatmap">
    <thead>
      <tr>
        <th></th>
        {#if columnLabels}
          {#each columnLabels as col}
            <th class="col-header">{col}</th>
          {/each}
        {/if}
      </tr>
    </thead>
    <tbody>
      {#each rows as row, ri}
        <tr style:animation-delay="{ri * 50}ms">
          <th class="row-header">{row.label}</th>
          {#each row.cells as cell}
            <td
              class="cell"
              style:--intensity={cellIntensity(cell.value)}
              style:--min-color={minColor ?? "var(--color-scale-low)"}
              style:--max-color={maxColor ?? "var(--color-scale-high)"}
            >
              {cell.label ?? cell.value}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .heatmap-wrapper {
    overflow-x: auto;
  }

  .heatmap {
    width: 100%;
    border-collapse: collapse;
  }

  thead th {
    font-family: var(--font-pixel);
    font-size: 8px;
    font-weight: 400;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    padding: var(--space-xs) var(--space-sm);
    text-align: center;
  }

  .row-header {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text);
    text-align: left;
    padding: var(--space-xs) var(--space-sm);
    white-space: nowrap;
  }

  .cell {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 600;
    text-align: center;
    padding: var(--space-xs) var(--space-sm);
    background: color-mix(
      in srgb,
      var(--max-color) calc(var(--intensity) * 100%),
      var(--min-color)
    );
    color: var(--color-text);
    border: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
    min-width: 48px;
  }

  tbody tr {
    animation: row-enter 0.4s cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  @keyframes row-enter {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
