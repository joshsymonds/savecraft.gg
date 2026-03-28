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
</style>
