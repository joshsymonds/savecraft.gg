<!--
  @component
  Inline label with semantic color.
  Used for rarity tiers, status indicators, and quality grades.
-->
<script lang="ts">
  type Variant =
    | "legendary" | "epic" | "rare" | "uncommon" | "common" | "poor"
    | "positive" | "negative" | "info" | "warning" | "highlight" | "muted";

  interface Props {
    /** Badge text */
    label: string;
    /** Color variant (default: "muted") */
    variant?: Variant;
  }

  let { label, variant = "muted" }: Props = $props();

  const variantColors: Record<Variant, string> = {
    legendary: "var(--color-rarity-legendary)",
    epic: "var(--color-rarity-epic)",
    rare: "var(--color-rarity-rare)",
    uncommon: "var(--color-rarity-uncommon)",
    common: "var(--color-rarity-common)",
    poor: "var(--color-rarity-poor)",
    positive: "var(--color-positive)",
    negative: "var(--color-negative)",
    info: "var(--color-info)",
    warning: "var(--color-warning)",
    highlight: "var(--color-highlight)",
    muted: "var(--color-text-muted)",
  };

  let color = $derived(variantColors[variant]);
</script>

<span class="badge" style:--badge-color={color}>
  {label}
</span>

<style>
  .badge {
    display: inline-block;
    font-family: var(--font-pixel);
    font-size: 9px;
    color: var(--badge-color);
    background: color-mix(in srgb, var(--badge-color) 12%, transparent);
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    text-transform: uppercase;
    letter-spacing: 1px;
    white-space: nowrap;
    line-height: 1.4;
  }
</style>
