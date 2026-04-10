<!--
  @component
  Compact currency display for PoE economy data.
  Shows chaos orb and/or divine orb values with inline currency icons.

  Usage:
    <PriceTag chaos={150} divine={1.2} />
    <PriceTag chaos={5} />
-->
<script lang="ts">
  interface Props {
    /** Value in Chaos Orbs */
    chaos?: number;
    /** Value in Divine Orbs */
    divine?: number;
    /** Optional confidence indicator: "high" | "low" */
    confidence?: "high" | "low";
    /** Compact mode — smaller text, single line */
    compact?: boolean;
  }

  let { chaos, divine, confidence, compact = false }: Props = $props();

  function fmt(n: number): string {
    if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    if (n >= 100) return Math.round(n).toString();
    if (n >= 10) return n.toFixed(1);
    return n.toFixed(2);
  }
</script>

<span class="price-tag" class:compact>
  {#if divine != null && divine > 0}
    <span class="currency divine">
      <span class="orb">
        <svg viewBox="0 0 18 18" width="16" height="16">
          <circle cx="9" cy="9" r="7" fill="#2a1800" stroke="#e8a430" stroke-width="1.5" />
          <circle cx="9" cy="9" r="3.5" fill="#e8a430" opacity="0.7" />
          <path d="M9 2.5L9 5M9 13L9 15.5M2.5 9L5 9M13 9L15.5 9" stroke="#e8a430" stroke-width="1" opacity="0.6" />
        </svg>
      </span>
      <span class="label">div</span>
      <span class="amount">{fmt(divine)}</span>
    </span>
  {/if}
  {#if chaos != null && chaos > 0}
    <span class="currency chaos">
      <span class="orb">
        <svg viewBox="0 0 18 18" width="16" height="16">
          <circle cx="9" cy="9" r="7" fill="#1a1400" stroke="#c8a84e" stroke-width="1.5" />
          <path d="M6 7Q9 3.5 12 7Q9 10.5 6 7Z" fill="#c8a84e" opacity="0.6" />
          <path d="M6 11Q9 7.5 12 11Q9 14.5 6 11Z" fill="#c8a84e" opacity="0.35" />
        </svg>
      </span>
      <span class="label">c</span>
      <span class="amount">{fmt(chaos)}</span>
    </span>
  {/if}
  {#if confidence === "low"}
    <span class="low-conf" title="Low confidence — few listings">~</span>
  {/if}
</span>

<style>
  .price-tag {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 700;
  }

  .price-tag.compact {
    font-size: 13px;
    gap: var(--space-xs);
  }

  .currency {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .orb {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }

  .compact .orb svg {
    width: 12px;
    height: 12px;
  }

  .label {
    font-family: var(--font-pixel);
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.6;
  }

  .divine .label { color: #e8a430; }
  .chaos .label { color: var(--color-gold); }

  .divine .amount {
    color: #e8a430;
  }

  .chaos .amount {
    color: var(--color-gold);
  }

  .low-conf {
    font-size: 12px;
    color: var(--color-text-muted);
    font-weight: 400;
  }
</style>
