<!--
  @component
  Multiplicative factor breakdown display.
  Shows A × B × C = Result with per-factor coloring.
  Used for surgery success chains, DPS calculations, material multipliers.
-->
<script lang="ts">
  type Variant = "positive" | "negative" | "highlight" | "info" | "warning" | "muted";

  interface Factor {
    label: string;
    value: number;
    variant?: Variant;
  }

  interface Props {
    /** Individual factors in the chain */
    factors: Factor[];
    /** Final computed result */
    result: Factor;
    /** Operator symbol between factors */
    operator?: string;
    /** Decimal places for values */
    precision?: number;
  }

  let { factors, result, operator = "×", precision = 2 }: Props = $props();
</script>

<div class="factor-chain">
  <div class="factor-items">
    {#each factors as factor, i}
      {#if i > 0}
        <span class="factor-operator">{operator}</span>
      {/if}
      <div class="factor-item" style:animation-delay="{i * 60}ms">
        <span class="factor-value {factor.variant ?? ''}">{factor.value.toFixed(precision)}</span>
        <span class="factor-label">{factor.label}</span>
      </div>
    {/each}
    <span class="factor-operator">=</span>
    <div class="factor-item factor-result" style:animation-delay="{factors.length * 60}ms">
      <span class="factor-value {result.variant ?? ''}">{result.value.toFixed(precision)}</span>
      <span class="factor-label">{result.label}</span>
    </div>
  </div>
</div>

<style>
  .factor-chain {
    overflow-x: auto;
  }

  .factor-items {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex-wrap: wrap;
  }

  .factor-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--space-sm) var(--space-md);
    background: color-mix(in srgb, var(--color-border) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
    border-radius: var(--radius-md);
    animation: factor-enter 0.4s cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  .factor-result {
    background: color-mix(in srgb, var(--color-gold) 8%, transparent);
    border-color: color-mix(in srgb, var(--color-gold) 30%, transparent);
  }

  .factor-value {
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 700;
    color: var(--color-text);
  }

  .factor-value.positive { color: var(--color-positive); }
  .factor-value.negative { color: var(--color-negative); }
  .factor-value.highlight { color: var(--color-highlight); }
  .factor-value.info { color: var(--color-info); }
  .factor-value.warning { color: var(--color-warning); }
  .factor-value.muted { color: var(--color-text-muted); }

  .factor-label {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .factor-operator {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-muted);
    padding: 0 2px;
    flex-shrink: 0;
  }

  @keyframes factor-enter {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
