<!--
  @component
  Grid of source cards with platform/device icons.
  Displays sources as visual cards with platform/device icons.
-->
<script lang="ts">
  import type { Source } from "$lib/types/source";

  import AddSourceCard from "./AddSourceCard.svelte";
  import SourceCard from "./SourceCard.svelte";

  let {
    sources,
    oncardclick,
    onadd,
  }: {
    sources: Source[];
    oncardclick?: (source: Source) => void;
    onadd?: () => void;
  } = $props();
</script>

<div class="source-card-grid">
  <span class="grid-label">SOURCES</span>
  <div class="grid">
    {#each sources as source (source.id)}
      <SourceCard {source} onclick={() => oncardclick?.(source)} />
    {/each}
    <AddSourceCard onclick={() => onadd?.()} />
  </div>
</div>

<style>
  .source-card-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .grid-label {
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .grid {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
</style>
