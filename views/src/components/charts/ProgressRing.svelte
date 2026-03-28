<!--
  @component
  SVG donut/ring with percentage value.
  Used for surgery success %, completion %, single-stat highlights.
-->
<script lang="ts">
  type Variant = "positive" | "negative" | "highlight" | "info";

  interface Props {
    /** Value from 0 to 100 */
    value: number;
    /** Text displayed in the center */
    label?: string;
    /** Ring color variant (default: "highlight") */
    variant?: Variant;
    /** Diameter in px (default: 80) */
    size?: number;
  }

  let { value, label, variant = "highlight", size = 80 }: Props = $props();

  const variantColors: Record<Variant, string> = {
    positive: "var(--color-positive)",
    negative: "var(--color-negative)",
    highlight: "var(--color-highlight)",
    info: "var(--color-info)",
  };

  let color = $derived(variantColors[variant]);

  const strokeWidth = 6;
  let radius = $derived((size - strokeWidth) / 2);
  let circumference = $derived(2 * Math.PI * radius);
  let offset = $derived(circumference * (1 - Math.min(Math.max(value, 0), 100) / 100));
  let center = $derived(size / 2);
</script>

<div class="progress-ring">
  <svg width={size} height={size} viewBox="0 0 {size} {size}">
    <circle
      cx={center}
      cy={center}
      r={radius}
      fill="none"
      stroke="var(--color-border)"
      stroke-width={strokeWidth}
      opacity="0.3"
    />
    <circle
      class="ring-fill"
      cx={center}
      cy={center}
      r={radius}
      fill="none"
      stroke={color}
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-dasharray={circumference}
      stroke-dashoffset={offset}
      transform="rotate(-90 {center} {center})"
    />
  </svg>
  {#if label}
    <span class="label" style:color={color}>{label}</span>
  {/if}
</div>

<style>
  .progress-ring {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .ring-fill {
    transition: stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .label {
    position: absolute;
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 700;
    text-align: center;
  }
</style>
