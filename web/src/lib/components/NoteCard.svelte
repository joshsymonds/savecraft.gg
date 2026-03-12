<!--
  @component
  Note display card with inline editing and delete confirmation.
  Shows title (gold pixel font), 3-line content clamp, metadata row.
  Hover reveals edit (pencil) and delete (X) buttons.
  Click edit to inline-edit title + content. Click X → DELETE/KEEP confirmation.
-->
<script lang="ts">
  import type { NoteSummary } from "$lib/types/source";

  let {
    note,
    ondelete,
    onedit,
  }: {
    note: NoteSummary;
    ondelete?: (noteId: string) => void | Promise<void>;
    onedit?: (noteId: string, title: string, content: string) => void | Promise<void>;
  } = $props();

  let confirmDelete = $state(false);
  let editing = $state(false);
  let saving = $state(false);
  let editTitle = $state("");
  let editContent = $state("");
  let editBytes = $derived(new Blob([editContent]).size);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${String(bytes)} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function resetConfirm(): void {
    confirmDelete = false;
  }

  function startEdit(): void {
    editTitle = note.title;
    editContent = note.content;
    editing = true;
  }

  async function saveEdit(): Promise<void> {
    if (!editTitle.trim() || saving) return;
    saving = true;
    try {
      await onedit?.(note.id, editTitle.trim(), editContent);
      editing = false;
    } finally {
      saving = false;
    }
  }

  function cancelEdit(): void {
    editing = false;
  }
</script>

{#if editing}
  <div class="note-card editing">
    <input
      type="text"
      class="edit-title-input"
      bind:value={editTitle}
      placeholder="Note title..."
    />
    <textarea class="edit-content-input" bind:value={editContent} rows={5}></textarea>
    <div class="edit-footer">
      <span class="edit-byte-counter">
        {editBytes.toLocaleString()} / 50,000 bytes
      </span>
      <div class="edit-actions">
        <button class="edit-cancel-btn" disabled={saving} onclick={cancelEdit}>CANCEL</button>
        <button class="edit-save-btn" disabled={!editTitle.trim() || saving} onclick={saveEdit}>
          {saving ? "SAVING..." : "SAVE"}
        </button>
      </div>
    </div>
  </div>
{:else}
  <div
    class="note-card"
    role="group"
    aria-label={note.title}
    onmouseleave={resetConfirm}
    onfocusout={resetConfirm}
  >
    <div class="note-header">
      <span class="note-title">{note.title}</span>
      <div class="note-actions">
        {#if !confirmDelete}
          <button
            class="action-btn edit-btn"
            aria-label={`Edit note: ${note.title}`}
            onclick={(clickEvent) => {
              clickEvent.stopPropagation();
              startEdit();
            }}
          >
            ✎
          </button>
          <button
            class="action-btn delete-btn"
            aria-label={`Delete note: ${note.title}`}
            onclick={(clickEvent) => {
              clickEvent.stopPropagation();
              confirmDelete = true;
            }}
          >
            ✕
          </button>
        {:else}
          <div class="confirm-buttons">
            <button
              class="confirm-delete"
              aria-label={`Confirm delete: ${note.title}`}
              onclick={async (clickEvent) => {
                clickEvent.stopPropagation();
                await ondelete?.(note.id);
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
    </div>
    <p class="note-preview">{note.content}</p>
    <div class="note-meta">
      <span>{note.source}</span>
      <span>{formatSize(note.sizeBytes)}</span>
      <span>{note.updatedAt}</span>
    </div>
  </div>
{/if}

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

  .note-card.editing {
    background: rgba(200, 168, 78, 0.024);
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

  .note-actions {
    display: flex;
    gap: 2px;
    margin-left: 12px;
    flex-shrink: 0;
  }

  .action-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 4px 6px;
    border-radius: 3px;
    opacity: 0;
    transition:
      opacity 0.15s,
      background 0.1s;
  }

  .note-card:hover .action-btn {
    opacity: 0.6;
  }

  .note-card:hover .action-btn:hover,
  .action-btn:focus-visible {
    opacity: 1;
  }

  .edit-btn {
    color: var(--color-text-dim);
  }

  .edit-btn:hover {
    background: rgba(74, 90, 173, 0.15);
  }

  .delete-btn {
    color: var(--color-red, #e85a5a);
  }

  .delete-btn:hover {
    background: rgba(232, 90, 90, 0.13);
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
    font-size: 10px;
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
    font-size: 10px;
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
    font-size: 15px;
    color: var(--color-text-muted);
  }

  /* -- Inline edit form ------------------------------------- */

  .edit-title-input {
    width: 100%;
    background: rgba(5, 7, 26, 0.6);
    border: 1px solid rgba(74, 90, 173, 0.3);
    border-radius: 3px;
    padding: 8px 10px;
    margin-bottom: 8px;
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text);
    outline: none;
    letter-spacing: 0.5px;
    box-sizing: border-box;
  }

  .edit-title-input:focus {
    border-color: var(--color-gold);
  }

  .edit-content-input {
    width: 100%;
    background: rgba(5, 7, 26, 0.6);
    border: 1px solid rgba(74, 90, 173, 0.3);
    border-radius: 3px;
    padding: 8px 10px;
    margin-bottom: 8px;
    resize: vertical;
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--color-text);
    outline: none;
    line-height: 1.4;
    box-sizing: border-box;
  }

  .edit-content-input:focus {
    border-color: var(--color-gold);
  }

  .edit-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .edit-byte-counter {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
  }

  .edit-actions {
    display: flex;
    gap: 6px;
  }

  .edit-cancel-btn {
    background: rgba(74, 90, 173, 0.1);
    border: 1px solid rgba(74, 90, 173, 0.25);
    border-radius: 3px;
    padding: 5px 12px;
    cursor: pointer;
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-dim);
    letter-spacing: 1px;
  }

  .edit-save-btn {
    background: rgba(200, 168, 78, 0.13);
    border: 1px solid rgba(200, 168, 78, 0.25);
    border-radius: 3px;
    padding: 5px 12px;
    cursor: pointer;
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-gold);
    letter-spacing: 1px;
  }

  .edit-save-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
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
