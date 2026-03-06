<!--
  @component
  Horizontal bar of source status chips.
  Shows connectivity health at a glance for all sources.
-->
<script lang="ts">
  import type { Source } from "$lib/types/source";

  import SourceChip from "./SourceChip.svelte";

  let {
    sources,
    onchipclick,
    onadd,
  }: {
    sources: Source[];
    onchipclick?: (source: Source) => void;
    onadd?: () => void;
  } = $props();
</script>

<div class="source-strip">
  <span class="strip-label">SOURCES</span>
  <div class="chip-row">
    {#each sources as source (source.id)}
      <SourceChip
        name={(source.hostname ?? source.name).toUpperCase()}
        status={source.status}
        lastSeen={source.lastSeen}
        onclick={() => onchipclick?.(source)}
      />
    {/each}
    <button class="add-chip" onclick={() => onadd?.()}>+ ADD SOURCE</button>
  </div>
</div>

<style>
  .source-strip {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: rgba(5, 7, 26, 0.4);
    border-bottom: 1px solid rgba(74, 90, 173, 0.12);
  }

  .strip-label {
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-gold);
    letter-spacing: 2px;
    flex-shrink: 0;
  }

  .chip-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  .add-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: rgba(200, 168, 78, 0.06);
    border: 1px dashed rgba(200, 168, 78, 0.3);
    border-radius: 3px;
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-gold);
    letter-spacing: 1px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .add-chip:hover {
    background: rgba(200, 168, 78, 0.12);
    border-color: var(--color-gold);
  }
</style>
