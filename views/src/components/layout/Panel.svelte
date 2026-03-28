<!--
  @component
  Retro bordered container with corner decorations.
  Matches the web app Panel — the primary layout primitive for Savecraft views.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    /** Optional accent color for border (defaults to theme border) */
    accent?: string;
    /** Optional padding override (defaults to --space-lg) */
    padding?: string;
    /** Slot content */
    children?: Snippet;
  }

  let { accent, padding, children }: Props = $props();

  let borderColor = $derived(accent ?? "var(--color-border)");
  let cornerColor = $derived(accent ?? "var(--color-border-light)");
</script>

<div
  class="panel"
  style:--panel-border={borderColor}
  style:--panel-corner={cornerColor}
  style:--panel-padding={padding ?? "var(--space-lg)"}
>
  <div class="corner top-left"></div>
  <div class="corner top-right"></div>
  <div class="corner bottom-left"></div>
  <div class="corner bottom-right"></div>
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
      0 0 12px color-mix(in srgb, var(--panel-border) 10%, transparent);
    overflow: hidden;
    animation: panel-enter 0.5s cubic-bezier(0.4, 0, 0.2, 1) both;
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
    width: 6px;
    height: 6px;
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
</style>
