<!--
  @component
  Tiny inline SVG trend line.
  Used for win rate trends, stat progression, inline data shapes.
-->
<script lang="ts">
  interface Props {
    /** Data points */
    values: number[];
    /** Line color (default: --color-info) */
    color?: string;
    /** SVG width in px (default: 80) */
    width?: number;
    /** SVG height in px (default: 24) */
    height?: number;
  }

  let { values, color = "var(--color-info)", width = 80, height = 24 }: Props = $props();

  const pad = 2;

  let points = $derived.by(() => {
    if (values.length === 0) return "";
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;
    return values
      .map((v, i) => {
        const x = pad + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
        const y = pad + innerH - ((v - min) / range) * innerH;
        return `${x},${y}`;
      })
      .join(" ");
  });
</script>

<svg class="sparkline" {width} {height} viewBox="0 0 {width} {height}">
  <polyline
    fill="none"
    stroke={color}
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    {points}
  />
</svg>

<style>
  .sparkline {
    display: inline-block;
    vertical-align: middle;
  }
</style>
