<!--
  @component
  Clickable save row: status icon, name, summary, notes badge, lastUpdated, hover arrow.
-->
<script lang="ts">
  import type { SaveSummary } from "$lib/types/device";

  let {
    save,
    onclick,
  }: {
    save: SaveSummary;
    onclick?: () => void;
  } = $props();
</script>

<button class="save-row" {onclick}>
  <div class="save-left">
    <span
      class="status-icon"
      class:success={save.status === "success"}
      class:error={save.status === "error"}
    >
      {save.status === "success" ? "\u2713" : "\u26A0"}
    </span>
    <div class="save-info">
      <span class="save-name">{save.saveName}</span>
      <span class="save-summary">{save.summary}</span>
    </div>
  </div>
  <div class="save-right">
    {#if save.notes.length > 0}
      <span class="notes-badge">{save.notes.length}</span>
    {/if}
    <span class="last-updated">{save.lastUpdated}</span>
    <span class="hover-arrow">&#9654;</span>
  </div>
</button>

<style>
  .save-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(74, 90, 173, 0.06);
    transition: background 0.1s;
    cursor: pointer;
    width: 100%;
    text-align: left;
  }

  .save-row:hover {
    background: rgba(74, 90, 173, 0.1);
  }

  .save-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .status-icon {
    font-family: var(--font-pixel);
    font-size: 10px;
    min-width: 14px;
    text-align: center;
  }

  .status-icon.success {
    color: var(--color-green);
  }

  .status-icon.error {
    color: var(--color-yellow);
  }

  .save-info {
    min-width: 0;
  }

  .save-name {
    display: block;
    font-family: var(--font-body);
    font-size: 20px;
    color: var(--color-text);
    line-height: 1.2;
  }

  .save-summary {
    display: block;
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
    line-height: 1.3;
  }

  .save-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .notes-badge {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-gold);
    background: rgba(200, 168, 78, 0.07);
    border: 1px solid rgba(200, 168, 78, 0.15);
    border-radius: 2px;
    padding: 1px 6px;
  }

  .last-updated {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
  }

  .hover-arrow {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-muted);
    opacity: 0.3;
    transition: opacity 0.15s;
  }

  .save-row:hover .hover-arrow {
    opacity: 1;
  }
</style>
