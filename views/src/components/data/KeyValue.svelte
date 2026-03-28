<!--
  @component
  Label-value pairs in a compact grid.
  Used for character attributes, equipment stats, config summaries.
-->
<script lang="ts">
  type Variant = "positive" | "negative" | "highlight" | "info" | "warning" | "muted";

  interface Item {
    key: string;
    value: string | number;
    variant?: Variant;
  }

  interface Props {
    /** The key-value pairs to display */
    items: Item[];
    /** Layout columns (default: 1) */
    columns?: 1 | 2;
  }

  let { items, columns = 1 }: Props = $props();

  const variantColors: Record<Variant, string> = {
    positive: "var(--color-positive)",
    negative: "var(--color-negative)",
    highlight: "var(--color-highlight)",
    info: "var(--color-info)",
    warning: "var(--color-warning)",
    muted: "var(--color-text-muted)",
  };
</script>

<dl class="kv" style:--kv-columns={columns}>
  {#each items as item, i}
    <div class="pair" class:row-even={Math.floor(i / columns) % 2 === 1}>
      <dt class="key">{item.key}</dt>
      <dd class="value" style:color={item.variant ? variantColors[item.variant] : "var(--color-text)"}>{item.value}</dd>
    </div>
  {/each}
</dl>

<style>
  .kv {
    display: grid;
    grid-template-columns: repeat(var(--kv-columns), 1fr);
    gap: 0 var(--space-lg);
  }

  .pair {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: var(--space-xs) var(--space-xs);
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
  }

  .pair.row-even {
    background: color-mix(in srgb, var(--color-border) 8%, transparent);
  }

  .pair:hover {
    background: color-mix(in srgb, var(--color-border) 14%, transparent);
  }

  .key {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .value {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 600;
    text-align: right;
  }
</style>
