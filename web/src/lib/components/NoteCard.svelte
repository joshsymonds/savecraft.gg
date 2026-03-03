<!--
  @component
  Note display card with delete confirmation.
  Shows title (gold pixel font), 3-line preview, metadata row.
  Hover reveals X button, which toggles DELETE/KEEP confirmation.
-->
<script lang="ts">
  import type { NoteSummary } from "$lib/types/device";

  let {
    note,
    ondelete,
  }: {
    note: NoteSummary;
    ondelete?: (noteId: string) => void;
  } = $props();

  let confirmDelete = $state(false);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${String(bytes)} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function handleMouseLeave(): void {
    confirmDelete = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="note-card" onmouseleave={handleMouseLeave}>
  <div class="note-header">
    <span class="note-title">{note.title}</span>
    {#if !confirmDelete}
      <button
        class="delete-x"
        onclick={(clickEvent) => {
          clickEvent.stopPropagation();
          confirmDelete = true;
        }}
      >
        &#10005;
      </button>
    {:else}
      <div class="confirm-buttons">
        <button
          class="confirm-delete"
          onclick={(clickEvent) => {
            clickEvent.stopPropagation();
            ondelete?.(note.id);
          }}
        >
          DELETE
        </button>
        <button
          class="confirm-keep"
          onclick={(clickEvent) => {
            clickEvent.stopPropagation();
            confirmDelete = false;
          }}
        >
          KEEP
        </button>
      </div>
    {/if}
  </div>
  <p class="note-preview">{note.preview}</p>
  <div class="note-meta">
    <span>{note.source}</span>
    <span>{formatSize(note.sizeBytes)}</span>
    <span>{note.updatedAt}</span>
  </div>
</div>

<style>
  .note-card {
    padding: 12px 14px;
    background: rgba(74, 90, 173, 0.04);
    border: 1px solid rgba(74, 90, 173, 0.1);
    border-radius: 4px;
    transition: all 0.15s;
  }

  .note-card:hover {
    background: rgba(200, 168, 78, 0.04);
    border-color: rgba(200, 168, 78, 0.19);
  }

  .note-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 6px;
  }

  .note-title {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-gold);
    line-height: 1.6;
    letter-spacing: 0.5px;
  }

  .delete-x {
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-muted);
    opacity: 0;
    transition: opacity 0.15s;
    padding: 2px 4px;
    margin-left: 12px;
  }

  .note-card:hover .delete-x {
    opacity: 0.7;
  }

  .delete-x:hover {
    opacity: 1 !important;
  }

  .confirm-buttons {
    display: flex;
    gap: 4px;
    margin-left: 12px;
    animation: fadeIn 0.15s ease-out;
  }

  .confirm-delete {
    background: rgba(232, 90, 90, 0.13);
    border: 1px solid rgba(232, 90, 90, 0.25);
    border-radius: 2px;
    padding: 2px 8px;
    cursor: pointer;
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-red, #e85a5a);
    letter-spacing: 0.5px;
  }

  .confirm-keep {
    background: rgba(74, 90, 173, 0.1);
    border: 1px solid rgba(74, 90, 173, 0.25);
    border-radius: 2px;
    padding: 2px 8px;
    cursor: pointer;
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-dim);
    letter-spacing: 0.5px;
  }

  .note-preview {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
    line-height: 1.4;
    max-height: 66px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    margin: 0;
  }

  .note-meta {
    display: flex;
    gap: 12px;
    margin-top: 6px;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
