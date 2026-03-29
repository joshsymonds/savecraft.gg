<!--
  @component
  Linear horizontal progress bar for inline stat displays.
  Complements ProgressRing (circular, 80px) with a compact bar
  suitable for skill levels, growth bars, budget tracking.
-->
<script lang="ts">
  type Variant = "positive" | "negative" | "highlight" | "info" | "warning" | "muted";

  interface Props {
    /** Current value */
    value: number;
    /** Maximum value (default: 100) */
    max?: number;
    /** Optional value label displayed beside the bar */
    label?: string;
    /** Bar color variant */
    variant?: Variant;
    /** Bar height in pixels */
    height?: number;
  }

  let { value, max = 100, label, variant = "info", height = 16 }: Props = $props();

  const variantColors: Record<Variant, string> = {
    positive: "var(--color-positive)",
    negative: "var(--color-negative)",
    highlight: "var(--color-highlight)",
    info: "var(--color-info)",
    warning: "var(--color-warning)",
    muted: "var(--color-text-muted)",
  };

  let pct = $derived(Math.min((value / Math.max(max, 1)) * 100, 100));
  let over = $derived(value > max);
</script>

<div class="progress-bar">
  <div class="progress-track" class:over style:height="{height}px">
    <div
      class="progress-fill"
      style:width="{pct}%"
      style:background={variantColors[variant]}
    ></div>
  </div>
  {#if label}
    <span class="progress-label">{label}</span>
  {/if}
</div>

<style>
  .progress-bar {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    animation: progress-enter 0.4s cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  .progress-track {
    flex: 1;
    background: color-mix(in srgb, var(--color-border) 15%, transparent);
    border-radius: 99px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
  }

  .progress-track.over {
    border-color: var(--color-negative);
    box-shadow: 0 0 4px color-mix(in srgb, var(--color-negative) 30%, transparent);
  }

  .progress-fill {
    height: 100%;
    border-radius: 99px;
    transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    min-width: 0;
  }

  .progress-label {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 700;
    color: var(--color-text);
    min-width: 36px;
    text-align: right;
    flex-shrink: 0;
  }

  @keyframes progress-enter {
    from {
      opacity: 0;
      transform: translateX(-4px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
</style>
