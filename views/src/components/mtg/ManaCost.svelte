<!--
  @component
  Parses MTG mana cost strings like "{2}{W}{B}" into a row of ManaPip components.
-->
<script lang="ts">
  import ManaPip from "./ManaPip.svelte";

  interface Props {
    /** Mana cost string, e.g. "{2}{W}{B}", "{X}{R}{R}", "{2}{W/U}{W/U}" */
    cost: string;
    /** Pip size */
    size?: "sm" | "md" | "lg";
  }

  let { cost, size = "md" }: Props = $props();

  let symbols = $derived.by(() => {
    if (!cost) return [];
    const matches = cost.match(/\{([^}]+)\}/g);
    if (!matches) return [];
    return matches.map((m) => m.slice(1, -1));
  });
</script>

{#if symbols.length > 0}
  <span class="mana-cost">
    {#each symbols as sym}
      <ManaPip symbol={sym} {size} />
    {/each}
  </span>
{/if}

<style>
  .mana-cost {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }
</style>
