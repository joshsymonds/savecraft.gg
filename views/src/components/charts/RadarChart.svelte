<!--
  @component
  Multi-axis polygon scoring chart (radar/spider chart).
  Used for draft advisor 8-axis scoring, multi-stat comparisons.
-->
<script lang="ts">
  interface Axis {
    label: string;
    value: number;
    max?: number;
  }

  interface Props {
    /** Axis definitions with labels and values */
    axes: Axis[];
    /** Polygon fill/stroke color (default: --color-info) */
    color?: string;
    /** Chart size in px (default: 200) */
    size?: number;
  }

  let { axes, color = "var(--color-info)", size = 200 }: Props = $props();

  const gridRings = [0.25, 0.5, 0.75, 1.0];
  const labelPad = 28;

  let center = $derived(size / 2);
  let radius = $derived((size - labelPad * 2) / 2);

  function polarToXY(angleFrac: number, r: number): [number, number] {
    const angle = angleFrac * 2 * Math.PI - Math.PI / 2;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  }

  let axisPoints = $derived(
    axes.map((a, i) => {
      const frac = i / axes.length;
      const max = a.max ?? Math.max(...axes.map((x) => x.value), 1);
      const norm = Math.min(a.value / max, 1);
      return {
        label: a.label,
        endX: polarToXY(frac, radius)[0],
        endY: polarToXY(frac, radius)[1],
        dataX: polarToXY(frac, radius * norm)[0],
        dataY: polarToXY(frac, radius * norm)[1],
        labelX: polarToXY(frac, radius + 14)[0],
        labelY: polarToXY(frac, radius + 14)[1],
        frac,
      };
    }),
  );

  let polygonPoints = $derived(
    axisPoints.map((p) => `${p.dataX},${p.dataY}`).join(" "),
  );
</script>

<svg class="radar-chart" width={size} height={size} viewBox="0 0 {size} {size}">
  <!-- Grid rings -->
  {#each gridRings as ringFrac}
    <polygon
      class="grid-ring"
      points={axes.map((_, i) => {
        const [x, y] = polarToXY(i / axes.length, radius * ringFrac);
        return `${x},${y}`;
      }).join(" ")}
    />
  {/each}

  <!-- Axis lines -->
  {#each axisPoints as pt}
    <line
      class="axis-line"
      x1={center}
      y1={center}
      x2={pt.endX}
      y2={pt.endY}
    />
  {/each}

  <!-- Data polygon -->
  <polygon
    class="data-polygon"
    points={polygonPoints}
    fill={color}
    stroke={color}
  />

  <!-- Data dots -->
  {#each axisPoints as pt}
    <circle
      class="data-dot"
      cx={pt.dataX}
      cy={pt.dataY}
      r="3"
      fill={color}
    />
  {/each}

  <!-- Axis labels -->
  {#each axisPoints as pt}
    <text
      class="axis-label"
      x={pt.labelX}
      y={pt.labelY}
      text-anchor="middle"
      dominant-baseline="central"
    >{pt.label}</text>
  {/each}
</svg>

<style>
  .radar-chart {
    display: block;
    margin: 0 auto;
    animation: fade-in 0.5s ease-out;
  }

  .grid-ring {
    fill: none;
    stroke: var(--color-border);
    stroke-width: 1;
    opacity: 0.25;
  }

  .axis-line {
    stroke: var(--color-border);
    stroke-width: 1;
    opacity: 0.3;
  }

  .data-polygon {
    fill-opacity: 0.15;
    stroke-width: 2;
    stroke-linejoin: round;
    animation: radar-grow 0.6s cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  .data-dot {
    animation: fade-in 0.4s ease-out 0.3s both;
  }

  .axis-label {
    font-family: var(--font-pixel);
    font-size: 7px;
    fill: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  @keyframes radar-grow {
    from {
      opacity: 0;
      transform: scale(0.3);
      transform-origin: center;
    }
    to {
      opacity: 1;
      transform: scale(1);
      transform-origin: center;
    }
  }
</style>
