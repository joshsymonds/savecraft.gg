<!--
  @component
  Multi-axis polygon scoring chart (radar/spider chart).
  Supports single series (axes prop) or multiple overlaid series (series + labels props).
-->
<script lang="ts">
  import Tooltip from "./Tooltip.svelte";

  interface Axis {
    label: string;
    value: number;
    max?: number;
  }

  interface Series {
    label: string;
    values: number[];
    color: string;
  }

  interface Props {
    /** Single-series shorthand: axis definitions with labels and values */
    axes?: Axis[];
    /** Multi-series: array of named data series */
    series?: Series[];
    /** Multi-series: shared axis labels */
    labels?: string[];
    /** Multi-series: shared max value */
    max?: number;
    /** Single-series polygon color (default: --color-info) */
    color?: string;
    /** Chart size in px (default: 200) */
    size?: number;
  }

  let { axes, series: seriesProp, labels: labelsProp, max: maxProp, color = "var(--color-info)", size = 200 }: Props = $props();

  // Normalize: convert single-series `axes` prop to multi-series format
  let axisLabels = $derived(
    labelsProp ?? axes?.map((a) => a.label) ?? [],
  );

  let normalizedSeries = $derived.by(() => {
    if (seriesProp) return seriesProp;
    if (axes) {
      return [{
        label: "default",
        values: axes.map((a) => a.value),
        color,
      }];
    }
    return [];
  });

  let globalMax = $derived(
    maxProp ?? (axes ? Math.max(...axes.map((a) => a.max ?? a.value), 1) : Math.max(...normalizedSeries.flatMap((s) => s.values), 1)),
  );

  const gridRings = [0.25, 0.5, 0.75, 1.0];
  const labelPad = 28;
  let center = $derived(size / 2);
  let radius = $derived((size - labelPad * 2) / 2);

  function polarToXY(angleFrac: number, r: number): [number, number] {
    const angle = angleFrac * 2 * Math.PI - Math.PI / 2;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  }

  let axisCount = $derived(axisLabels.length);

  let axisEndpoints = $derived(
    axisLabels.map((label, i) => {
      const frac = i / axisCount;
      return {
        label,
        endX: polarToXY(frac, radius)[0],
        endY: polarToXY(frac, radius)[1],
        labelX: polarToXY(frac, radius + 14)[0],
        labelY: polarToXY(frac, radius + 14)[1],
      };
    }),
  );

  let seriesData = $derived(
    normalizedSeries.map((s) => ({
      ...s,
      points: s.values.map((v, i) => {
        const frac = i / axisCount;
        const norm = Math.min(v / globalMax, 1);
        const [x, y] = polarToXY(frac, radius * norm);
        return { x, y, value: v, label: axisLabels[i] };
      }),
      polygonPoints: s.values.map((v, i) => {
        const frac = i / axisCount;
        const norm = Math.min(v / globalMax, 1);
        const [x, y] = polarToXY(frac, radius * norm);
        return `${x},${y}`;
      }).join(" "),
    })),
  );

  // Tooltip
  let tip = $state({ text: "", x: 0, y: 0, visible: false });

  function showTip(e: MouseEvent, seriesLabel: string, axisLabel: string, value: number) {
    const svg = (e.currentTarget as SVGElement).closest("svg")!;
    const rect = svg.getBoundingClientRect();
    const prefix = normalizedSeries.length > 1 ? `${seriesLabel} — ` : "";
    tip = { text: `${prefix}${axisLabel}: ${value}`, x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true };
  }

  function hideTip() { tip.visible = false; }
</script>

<div style="position: relative; display: inline-block;">
  <Tooltip {...tip} />
  <svg class="radar-chart" width={size} height={size} viewBox="0 0 {size} {size}">
    <!-- Grid rings -->
    {#each gridRings as ringFrac}
      <polygon
        class="grid-ring"
        points={axisLabels.map((_, i) => {
          const [x, y] = polarToXY(i / axisCount, radius * ringFrac);
          return `${x},${y}`;
        }).join(" ")}
      />
    {/each}

    <!-- Axis lines -->
    {#each axisEndpoints as pt}
      <line class="axis-line" x1={center} y1={center} x2={pt.endX} y2={pt.endY} />
    {/each}

    <!-- Series polygons -->
    {#each seriesData as s, si}
      <polygon
        class="data-polygon"
        points={s.polygonPoints}
        fill={s.color}
        stroke={s.color}
        style:animation-delay="{si * 150}ms"
      />
      <!-- Data dots with tooltip -->
      {#each s.points as pt}
        <circle
          class="data-dot"
          cx={pt.x}
          cy={pt.y}
          r="4"
          fill={s.color}
          stroke={s.color}
          onmouseenter={(e) => showTip(e, s.label, pt.label, pt.value)}
          onmouseleave={hideTip}
        />
      {/each}
    {/each}

    <!-- Axis labels -->
    {#each axisEndpoints as pt}
      <text
        class="axis-label"
        x={pt.labelX}
        y={pt.labelY}
        text-anchor="middle"
        dominant-baseline="central"
      >{pt.label}</text>
    {/each}
  </svg>
</div>

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
    fill-opacity: 0.12;
    stroke-width: 2;
    stroke-linejoin: round;
    animation: radar-grow 0.6s cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  .data-dot {
    fill-opacity: 0.8;
    stroke-width: 2;
    stroke-opacity: 0.3;
    cursor: pointer;
    transition: r 0.15s ease;
    animation: fade-in 0.4s ease-out 0.3s both;
  }

  .data-dot:hover {
    r: 6;
    fill-opacity: 1;
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
