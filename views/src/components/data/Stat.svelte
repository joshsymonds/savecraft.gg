<!--
  @component
  Large prominent number with label below.
  Used for hero stats: success percentages, total counts, win rates, grades.
-->
<script lang="ts">
  type Variant = "positive" | "negative" | "highlight" | "info" | "muted";

  interface Props {
    /** The big number or grade (e.g., "85.5%", 47, "A+") */
    value: string | number;
    /** Description below the value */
    label: string;
    /** Color variant for the value (default: "highlight") */
    variant?: Variant;
  }

  let { value, label, variant = "highlight" }: Props = $props();

  const variantColors: Record<Variant, string> = {
    positive: "var(--color-positive)",
    negative: "var(--color-negative)",
    highlight: "var(--color-highlight)",
    info: "var(--color-info)",
    muted: "var(--color-text-muted)",
  };

  let color = $derived(variantColors[variant]);
</script>

<div class="stat">
  <span class="value" style:color={color}>{value}</span>
  <span class="label">{label}</span>
</div>

<style>
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .value {
    font-family: var(--font-heading);
    font-size: 32px;
    font-weight: 700;
    line-height: 1.1;
  }

  .label {
    font-family: var(--font-pixel);
    font-size: 9px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1.5px;
  }
</style>
