<!--
  @component
  Responsive auto-fill grid for card/item collections.
  Grid items fill available space with a configurable minimum width.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    /** Minimum card width in pixels (default: 260) */
    minWidth?: number;
    /** Gap between grid items (default: --space-md) */
    gap?: string;
    /** Slot content — grid items */
    children?: Snippet;
  }

  let { minWidth = 260, gap, children }: Props = $props();
</script>

<div
  class="grid"
  style:--grid-min-width="{minWidth}px"
  style:--grid-gap={gap ?? "var(--space-md)"}
>
  {@render children?.()}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--grid-min-width), 1fr));
    gap: var(--grid-gap);
  }

  /* Staggered card reveal. The grid item is the single moving element —
     suppress any inner Panel's own enter animation so each card lands
     as one unit. Delay caps at the 4th card (~645ms total). */
  .grid > :global(*) {
    animation: card-in 420ms ease-out both;
  }

  .grid :global(.panel) {
    animation: none;
  }

  .grid > :global(*:nth-child(2)) {
    animation-delay: 75ms;
  }

  .grid > :global(*:nth-child(3)) {
    animation-delay: 150ms;
  }

  .grid > :global(*:nth-child(n + 4)) {
    animation-delay: 225ms;
  }

  @keyframes card-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
