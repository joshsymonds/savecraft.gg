<!--
  @component
  Modal showing save details: notes list with CRUD, save metadata.
  Stacks on top of GameDetailModal when a SaveRow is clicked.
-->
<script lang="ts">
  import type { NoteSummary, Save } from "$lib/types/source";
  import { onMount } from "svelte";

  import Modal from "./Modal.svelte";
  import NoteCard from "./NoteCard.svelte";
  import TinyButton from "./TinyButton.svelte";
  import WindowTitleBar from "./WindowTitleBar.svelte";

  let {
    save,
    onclose,
    loadNotes,
    onnotecreate,
    onnotedelete,
    onnoteedit,
  }: {
    save: Save;
    onclose: () => void;
    loadNotes: (saveUuid: string) => Promise<NoteSummary[]>;
    onnotecreate?: (saveUuid: string, title: string, content: string) => Promise<void>;
    onnotedelete?: (saveUuid: string, noteId: string) => Promise<void>;
    onnoteedit?: (
      saveUuid: string,
      noteId: string,
      title: string,
      content: string,
    ) => Promise<void>;
  } = $props();

  // -- Notes --
  let notes: NoteSummary[] = $state([]);
  let notesLoaded = $state(false);

  async function doLoadNotes() {
    notes = await loadNotes(save.saveUuid);
    notesLoaded = true;
  }

  onMount(() => {
    void doLoadNotes();
  });

  // -- Note creation --
  let creating = $state(false);
  let newTitle = $state("");
  let newContent = $state("");
  let savingNote = $state(false);

  async function handleCreateNote() {
    if (!onnotecreate || !newTitle.trim() || savingNote) return;
    savingNote = true;
    try {
      await onnotecreate(save.saveUuid, newTitle.trim(), newContent);
      creating = false;
      newTitle = "";
      newContent = "";
      await doLoadNotes();
    } finally {
      savingNote = false;
    }
  }

  function cancelCreate() {
    creating = false;
    newTitle = "";
    newContent = "";
  }
</script>

<Modal id="save-detail-{save.saveUuid}" tiled {onclose} width="520px" ariaLabel="Save details">
  <WindowTitleBar activeLabel={save.saveName} activeSublabel={save.summary}>
    {#snippet right()}
      <button class="modal-close" onclick={() => onclose()}>&#x2715;</button>
    {/snippet}
  </WindowTitleBar>

  <div class="notes-area">
    {#if notesLoaded && notes.length > 0}
      {#each notes as note (note.id)}
        <NoteCard
          {note}
          ondelete={onnotedelete ? () => onnotedelete(save.saveUuid, note.id) : undefined}
          onedit={onnoteedit
            ? (_noteId, title, content) => onnoteedit(save.saveUuid, note.id, title, content)
            : undefined}
        />
      {/each}
    {:else if notesLoaded}
      <div class="empty-notes">
        <span class="empty-text">No notes yet</span>
      </div>
    {/if}

    {#if onnotecreate && notesLoaded}
      {#if creating}
        <div class="create-note-form">
          <input
            type="text"
            class="create-title-input"
            placeholder="Note title..."
            bind:value={newTitle}
          />
          <textarea
            class="create-content-input"
            placeholder="Note content..."
            bind:value={newContent}
            rows={4}
          ></textarea>
          <div class="create-actions">
            <TinyButton label="CANCEL" onclick={cancelCreate} disabled={savingNote} />
            <TinyButton
              label={savingNote ? "SAVING..." : "SAVE"}
              onclick={handleCreateNote}
              disabled={!newTitle.trim() || savingNote}
            />
          </div>
        </div>
      {:else}
        <div class="create-note-row">
          <TinyButton label="NEW NOTE" onclick={() => (creating = true)} />
        </div>
      {/if}
    {/if}
  </div>

  {#snippet footer()}
    <button class="modal-btn" onclick={() => onclose()}>DISMISS</button>
  {/snippet}
</Modal>

<style>
  .notes-area {
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty-notes {
    padding: 32px 16px;
    text-align: center;
  }

  .empty-text {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-muted);
  }

  /* -- Note creation -- */

  .create-note-row {
    margin-top: 4px;
  }

  .create-note-form {
    margin-top: 4px;
    padding: 12px 14px;
    background: rgba(200, 168, 78, 0.024);
    border: 1px solid rgba(200, 168, 78, 0.19);
    border-radius: 4px;
  }

  .create-title-input {
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

  .create-title-input:focus {
    border-color: var(--color-gold);
  }

  .create-title-input::placeholder {
    color: var(--color-text-muted);
  }

  .create-content-input {
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

  .create-content-input:focus {
    border-color: var(--color-gold);
  }

  .create-content-input::placeholder {
    color: var(--color-text-muted);
  }

  .create-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
</style>
