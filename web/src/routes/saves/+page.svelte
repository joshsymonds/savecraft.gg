<!--
  @component
  Saves page: characters grouped by game with summary panels.
-->
<script lang="ts">
  import { Panel } from "$lib/components";
  import { saves, savesLoading, savesError, loadSaves } from "$lib/stores/saves";
  import type { Save } from "$lib/types/save";
  import { SvelteMap } from "svelte/reactivity";
  import { onMount } from "svelte";

  onMount(() => {
    loadSaves();
  });

  /** Group saves by gameName, preserving insertion order. */
  let grouped = $derived.by(() => {
    const groups = new SvelteMap<string, Save[]>();
    for (const save of $saves) {
      const existing = groups.get(save.gameName);
      if (existing) {
        existing.push(save);
      } else {
        groups.set(save.gameName, [save]);
      }
    }
    return groups;
  });
</script>

<div class="saves-page">
  <div class="page-header">
    <span class="page-label">SAVES</span>
    {#if $savesLoading}
      <span class="save-count">loading...</span>
    {:else}
      <span class="save-count">{$saves.length} characters</span>
    {/if}
  </div>

  {#if $savesError}
    <div class="error-message">{$savesError}</div>
  {/if}

  {#each [...grouped] as [gameName, gameSaves] (gameName)}
    <section class="game-group">
      <div class="game-header">
        <span class="game-label">{gameName.toUpperCase()}</span>
        <span class="game-count">{gameSaves.length}</span>
      </div>

      <div class="save-list">
        {#each gameSaves as save (save.id)}
          <Panel>
            <div class="save-card">
              <div class="save-top">
                <span class="save-name">{save.saveName}</span>
              </div>
              <div class="save-summary">{save.summary}</div>
              <div class="save-updated">Last updated {save.lastUpdated}</div>
            </div>
          </Panel>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .saves-page {
    padding: 24px 28px;
    max-width: 900px;
  }

  .page-header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 20px;
  }

  .page-label {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .save-count {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
  }

  .error-message {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-danger, #e85a5a);
    margin-bottom: 16px;
    padding: 8px 12px;
    background: rgba(232, 90, 90, 0.1);
    border: 1px solid rgba(232, 90, 90, 0.3);
    border-radius: 4px;
  }

  /* ── Game groups ──────────────────────────────────────── */

  .game-group {
    margin-bottom: 28px;
  }

  .game-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 10px;
  }

  .game-label {
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-text-dim);
    letter-spacing: 1.5px;
  }

  .game-count {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-muted);
  }

  .save-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* ── Save cards ───────────────────────────────────────── */

  .save-card {
    padding: 12px 16px;
  }

  .save-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 4px;
  }

  .save-name {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text);
    letter-spacing: 0.5px;
  }

  .save-summary {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text);
    line-height: 1.3;
    margin-bottom: 4px;
  }

  .save-updated {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
  }
</style>
