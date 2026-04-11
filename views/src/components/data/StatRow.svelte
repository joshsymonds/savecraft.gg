<!--
  @component
  Flex container for arranging Stat components in a row.
  Used for hero stat displays at the top of sections.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    /** Horizontal alignment (default: "space-around") */
    justify?: "space-around" | "center";
    /** Gap between items (default: "var(--space-md)") */
    gap?: string;
    /** Padding around the row (default: "var(--space-sm) 0") */
    padding?: string;
    /** Stack vertically instead of horizontally */
    vertical?: boolean;
    children: Snippet;
  }

  let {
    justify = "space-around",
    gap = "var(--space-md)",
    padding = "var(--space-sm) 0",
    vertical = false,
    children,
  }: Props = $props();
</script>

<div
  class="stat-row"
  style:flex-direction={vertical ? "column" : "row"}
  style:justify-content={justify}
  style:gap={gap}
  style:padding={padding}
>
  {@render children()}
</div>

<style>
  .stat-row {
    display: flex;
    align-items: center;
  }
</style>
