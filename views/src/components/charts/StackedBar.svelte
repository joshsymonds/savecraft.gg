<!--
  @component
  Single segmented horizontal bar with legend.
  Used for mana distribution, wildcard cost breakdown, rarity breakdown.
-->
<script lang="ts">
  interface Segment {
    label: string;
    value: number;
    color: string;
  }

  interface Props {
    /** Segments with label, value, and color */
    segments: Segment[];
  }

  let { segments }: Props = $props();

  let total = $derived(segments.reduce((sum, s) => sum + s.value, 0) || 1);
</script>

<div class="stacked-bar-chart">
  <div class="bar-track">
    {#each segments as seg, i}
      <div
        class="segment"
        style:width="{(seg.value / total) * 100}%"
        style:background={seg.color}
        style:animation-delay="{i * 80}ms"
      ></div>
    {/each}
  </div>
  <div class="legend">
    {#each segments as seg}
      <div class="legend-entry">
        <span class="legend-swatch" style:background={seg.color}></span>
        <span class="legend-label">{seg.label}</span>
        <span class="legend-value">{seg.value}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .stacked-bar-chart {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .bar-track {
    display: flex;
    height: 18px;
    border-radius: 99px;
    overflow: hidden;
    background: color-mix(in srgb, var(--color-border) 15%, transparent);
  }

  .segment {
    height: 100%;
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    animation: segment-grow 0.5s cubic-bezier(0.4, 0, 0.2, 1) both;
    min-width: 2px;
  }

  .segment + .segment {
    border-left: 1px solid color-mix(in srgb, var(--color-bg) 40%, transparent);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-md);
  }

  .legend-entry {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .legend-swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .legend-label {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .legend-value {
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text);
  }

  @keyframes segment-grow {
    from {
      opacity: 0;
      transform: scaleX(0);
    }
    to {
      opacity: 1;
      transform: scaleX(1);
    }
  }
</style>
