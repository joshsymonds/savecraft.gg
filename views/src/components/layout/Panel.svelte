<!--
  @component
  Retro bordered container with corner decorations.
  Matches the web app Panel — the primary layout primitive for Savecraft views.
  Use nested=true for inner panels (flat surface, no corners, thinner border).
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    /** Optional accent color for border (defaults to theme border) */
    accent?: string;
    /** Optional padding override (defaults to --space-lg) */
    padding?: string;
    /** Nested/inner panel variant — flat bg, no corners, thinner border */
    nested?: boolean;
    /** Compact variant for grid cards — no corners, lighter shadow, smaller padding */
    compact?: boolean;
    /** Optional game icon URL rendered as a subtle centered watermark */
    watermark?: string;
    /** Slot content */
    children?: Snippet;
  }

  let { accent, padding, nested = false, compact = false, watermark, children }: Props = $props();

  let borderColor = $derived(accent ?? "var(--color-border)");
  let cornerColor = $derived(accent ?? "var(--color-border-light)");
</script>

<div
  class="panel"
  class:nested
  class:compact
  style:--panel-border={borderColor}
  style:--panel-corner={cornerColor}
  style:--panel-padding={padding ?? (compact ? "var(--space-md)" : "var(--space-lg)")}
>
  {#if !nested && !compact}
    <div class="corner top-left"></div>
    <div class="corner top-right"></div>
    <div class="corner bottom-left"></div>
    <div class="corner bottom-right"></div>
  {/if}
  {#if watermark}
    <img class="panel-watermark" src={watermark} alt="" aria-hidden="true" />
  {/if}
  {@render children?.()}
</div>

<style>
  .panel {
    position: relative;
    background: var(--color-panel-bg);
    border: 2px solid var(--panel-border);
    border-radius: var(--radius-md);
    padding: var(--panel-padding);
    box-shadow:
      inset 0 0 20px rgba(30, 40, 100, 0.2),
      0 0 14px color-mix(in srgb, var(--panel-border) 30%, transparent),
      0 0 36px color-mix(in srgb, var(--panel-border) 12%, transparent);
    overflow: visible;
    animation: panel-enter 550ms cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  /* CRT scanline overlay — texture rides above content, never blocks it */
  .panel::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: repeating-linear-gradient(
      0deg,
      rgba(0, 0, 0, 0.22) 0px,
      rgba(0, 0, 0, 0.22) 1px,
      transparent 1px,
      transparent 3px
    );
    opacity: var(--scanline-opacity);
    pointer-events: none;
    z-index: 2;
  }

  :global([data-theme="light"]) .panel:not(.nested):not(.compact) {
    box-shadow:
      0 0 10px color-mix(in srgb, var(--panel-border) 18%, transparent),
      0 0 24px color-mix(in srgb, var(--panel-border) 7%, transparent);
  }

  .panel.nested {
    background: var(--color-surface);
    border-width: 1px;
    border-color: color-mix(in srgb, var(--panel-border) 50%, transparent);
    box-shadow:
      inset 0 0 12px rgba(10, 14, 46, 0.3),
      0 0 10px color-mix(in srgb, var(--panel-border) 25%, transparent);
    animation: none;
  }

  :global([data-theme="light"]) .panel.nested {
    box-shadow: 0 0 10px color-mix(in srgb, var(--panel-border) 25%, transparent);
  }

  .panel.compact {
    box-shadow: 0 0 8px color-mix(in srgb, var(--panel-border) 6%, transparent);
    animation: none;
  }

  @keyframes panel-enter {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .corner {
    position: absolute;
    width: 8px;
    height: 8px;
    filter: drop-shadow(0 0 3px var(--panel-corner));
  }

  .top-left {
    top: -1px;
    left: -1px;
    border-top: 2px solid var(--panel-corner);
    border-left: 2px solid var(--panel-corner);
  }

  .top-right {
    top: -1px;
    right: -1px;
    border-top: 2px solid var(--panel-corner);
    border-right: 2px solid var(--panel-corner);
  }

  .bottom-left {
    bottom: -1px;
    left: -1px;
    border-bottom: 2px solid var(--panel-corner);
    border-left: 2px solid var(--panel-corner);
  }

  .bottom-right {
    bottom: -1px;
    right: -1px;
    border-bottom: 2px solid var(--panel-corner);
    border-right: 2px solid var(--panel-corner);
  }

  .panel-watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 96px;
    height: 96px;
    object-fit: contain;
    opacity: 0.1;
    pointer-events: none;
    z-index: 0;
  }
</style>
