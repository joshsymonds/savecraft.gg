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
  }: {
    sources: Source[];
    onchipclick?: (source: Source) => void;
  } = $props();
</script>

{#if sources.length > 0}
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
    </div>
  </div>
{:else}
  <div class="source-strip empty">
    <span class="strip-label">NO SOURCES</span>
    <span class="strip-hint">Install the Savecraft daemon to start watching saves</span>
  </div>
{/if}

<style>
  .source-strip {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: rgba(5, 7, 26, 0.4);
    border-bottom: 1px solid rgba(74, 90, 173, 0.12);
  }

  .source-strip.empty {
    gap: 10px;
  }

  .strip-label {
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-gold);
    letter-spacing: 2px;
    flex-shrink: 0;
  }

  .strip-hint {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-muted);
  }

  .chip-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>
