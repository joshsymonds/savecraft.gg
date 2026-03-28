<!--
  @component
  Arranges two content areas with a Divider between them.
  Vertical (stacked) or horizontal (side-by-side).
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import Divider from "./Divider.svelte";

  interface Props {
    /** Layout direction (default: "vertical") */
    direction?: "horizontal" | "vertical";
    /** Divider center decoration (default: "diamond") */
    decoration?: "diamond" | "cross" | "none";
    /** Primary content (top or left) */
    primary?: Snippet;
    /** Secondary content (bottom or right) */
    secondary?: Snippet;
  }

  let { direction = "vertical", decoration = "diamond", primary, secondary }: Props = $props();
</script>

<div class="split-layout" class:horizontal={direction === "horizontal"}>
  <div class="split-primary">
    {@render primary?.()}
  </div>
  <Divider direction={direction === "horizontal" ? "vertical" : "horizontal"} {decoration} />
  <div class="split-secondary">
    {@render secondary?.()}
  </div>
</div>

<style>
  .split-layout {
    display: flex;
    flex-direction: column;
  }

  .split-layout.horizontal {
    flex-direction: row;
  }

  .split-primary,
  .split-secondary {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
</style>
