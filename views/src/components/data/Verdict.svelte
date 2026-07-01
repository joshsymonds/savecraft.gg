<!--
  @component
  Hero verdict — the AI's headline answer, celebrated.
  Oversized value with optional arcade stamp plate, landing pulse, and
  count-up for numeric values. One per view, placed where the answer is.
-->
<script lang="ts">
  import { countUp } from "./count-up.js";

  type Variant =
    | "positive" | "negative" | "info" | "warning" | "highlight"
    | "legendary" | "epic" | "rare" | "uncommon" | "common" | "poor";

  interface Props {
    /** The headline answer (e.g., "~134 runs", "Factory Stalled") */
    value: string;
    /** Pixel-font caption above the fold (rendered uppercase) */
    caption: string;
    /** Optional supporting line */
    sub?: string;
    /** Optional stamp plate text (e.g., "S", "B+", "!") */
    stamp?: string;
    /** Color variant (default: "highlight") */
    variant?: Variant;
  }

  let { value, caption, sub, stamp, variant = "highlight" }: Props = $props();

  const variantColors: Record<Variant, string> = {
    positive: "var(--color-positive)",
    negative: "var(--color-negative)",
    info: "var(--color-info)",
    warning: "var(--color-warning)",
    highlight: "var(--color-gold)",
    legendary: "var(--color-rarity-legendary)",
    epic: "var(--color-rarity-epic)",
    rare: "var(--color-rarity-rare)",
    uncommon: "var(--color-rarity-uncommon)",
    common: "var(--color-rarity-common)",
    poor: "var(--color-rarity-poor)",
  };

  let color = $derived(variantColors[variant]);
  // Gold frames pair with the brighter gold for value text; every other
  // variant's color is already bright enough to carry the value itself.
  let textColor = $derived(variant === "highlight" ? "var(--color-gold-light)" : color);

  // Numeric verdicts count up from 0; phrases render as-is.
  let display = $state(String(value));
  $effect(() => countUp(value, (s) => (display = s)));
</script>

<div class="verdict" style:--verdict-color={color} style:--verdict-text={textColor}>
  {#if stamp}
    <div class="stamp" class:small={stamp.length > 1}>{stamp}</div>
  {/if}
  <div class="main">
    <span class="value">{display}</span>
    <span class="caption">{caption}</span>
    {#if sub}
      <span class="sub">{sub}</span>
    {/if}
  </div>
</div>

<style>
  .verdict {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    animation: verdict-land 550ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
  }

  /* The stamp lands a beat after the frame — intentional two-beat effect */
  .stamp {
    flex-shrink: 0;
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-pixel);
    font-size: 28px;
    color: var(--verdict-text);
    border: 3px solid var(--verdict-color);
    outline: 1px solid color-mix(in srgb, var(--verdict-color) 40%, transparent);
    outline-offset: 3px;
    border-radius: var(--radius-md);
    transform: rotate(-6deg);
    box-shadow:
      0 0 16px color-mix(in srgb, var(--verdict-color) 40%, transparent),
      inset 0 0 12px color-mix(in srgb, var(--verdict-color) 25%, transparent);
    animation: stamp-land 450ms cubic-bezier(0.2, 0.9, 0.3, 1.4) 200ms both;
  }

  .stamp.small {
    font-size: 20px;
  }

  .main {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    min-width: 0;
  }

  .value {
    font-family: var(--font-heading);
    font-size: 48px;
    font-weight: 700;
    line-height: 1;
    color: var(--verdict-text);
    text-shadow: 0 0 24px color-mix(in srgb, var(--verdict-color) 35%, transparent);
  }

  .caption {
    font-family: var(--font-pixel);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--color-text-muted);
  }

  .sub {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-dim);
  }

  @keyframes verdict-land {
    0% {
      opacity: 0;
      transform: scale(0.94);
      filter: brightness(1.5);
    }
    60% {
      transform: scale(1.02);
    }
    100% {
      opacity: 1;
      transform: scale(1);
      filter: brightness(1);
    }
  }

  @keyframes stamp-land {
    0% {
      opacity: 0;
      transform: rotate(-6deg) scale(1.6);
    }
    100% {
      opacity: 1;
      transform: rotate(-6deg) scale(1);
    }
  }
</style>
