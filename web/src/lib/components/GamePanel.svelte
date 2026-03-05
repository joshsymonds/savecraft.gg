<!--
  @component
  Game-centric dashboard panel. Shows a grid of games merged across sources.
  Progressive disclosure: games grid -> saves list -> save detail (notes).
  Replaces the source-level navigation of SourceWindow.
-->
<script lang="ts">
  import type { Game, NoteSummary, Save } from "$lib/types/source";

  import GameCard from "./GameCard.svelte";
  import NoteCard from "./NoteCard.svelte";
  import Panel from "./Panel.svelte";
  import SaveRow from "./SaveRow.svelte";
  import TinyButton from "./TinyButton.svelte";
  import WindowTitleBar from "./WindowTitleBar.svelte";

  let {
    games,
    showSourceBadges = false,
    onadd,
    loadNotes,
    onnotecreate,
    onnotedelete,
    onnoteedit,
    initialGameId,
    initialSaveUuid,
  }: {
    games: Game[];
    showSourceBadges?: boolean;
    onadd?: () => void;
    loadNotes?: (saveUuid: string) => Promise<NoteSummary[]>;
    onnotecreate?: (saveUuid: string, title: string, content: string) => Promise<void>;
    onnotedelete?: (saveUuid: string, noteId: string) => Promise<void>;
    onnoteedit?: (
      saveUuid: string,
      noteId: string,
      title: string,
      content: string,
    ) => Promise<void>;
    initialGameId?: string;
    initialSaveUuid?: string;
  } = $props();

  // -- Navigation state --

  let navGameId: string | null = $state(initialGameId ?? null);
  let navSaveUuid: string | null = $state(initialSaveUuid ?? null);

  let activeGame = $derived(navGameId ? games.find((g) => g.gameId === navGameId) : null);
  let activeSave = $derived(
    navSaveUuid && activeGame ? activeGame.saves.find((s) => s.saveUuid === navSaveUuid) : null,
  );

  // -- Notes --

  let notes: NoteSummary[] = $state([]);
  let notesLoaded = $state(false);

  async function doLoadNotes(saveUuid: string) {
    notesLoaded = false;
    if (loadNotes) {
      notes = await loadNotes(saveUuid);
      notesLoaded = true;
    }
  }

  // -- Note creation --

  let creating = $state(false);
  let newTitle = $state("");
  let newContent = $state("");
  let savingNote = $state(false);

  async function handleCreateNote() {
    if (!onnotecreate || !activeSave || !newTitle.trim() || savingNote) return;
    savingNote = true;
    try {
      await onnotecreate(activeSave.saveUuid, newTitle.trim(), newContent);
      creating = false;
      newTitle = "";
      newContent = "";
      await doLoadNotes(activeSave.saveUuid);
    } finally {
      savingNote = false;
    }
  }

  function cancelCreate() {
    creating = false;
    newTitle = "";
    newContent = "";
  }

  async function enterSave(save: Save) {
    navSaveUuid = save.saveUuid;
    await doLoadNotes(save.saveUuid);
  }

  // Load notes for initially-selected save (Storybook pre-navigation)
  $effect(() => {
    if (initialSaveUuid && navSaveUuid === initialSaveUuid && !notesLoaded) {
      void doLoadNotes(initialSaveUuid);
    }
  });
</script>

<Panel>
  {#if activeSave && activeGame}
    <!-- Save level: notes -->
    <WindowTitleBar
      parents={[
        {
          label: "GAMES",
          onclick: () => {
            navGameId = null;
            navSaveUuid = null;
          },
        },
        {
          label: activeGame.name,
          onclick: () => {
            navSaveUuid = null;
          },
        },
      ]}
      activeLabel={activeSave.saveName}
      activeSublabel={activeSave.summary}
    />
    <div class="notes-area">
      {#if notesLoaded && notes.length > 0}
        {#each notes as note (note.id)}
          <NoteCard
            {note}
            ondelete={onnotedelete ? () => onnotedelete(activeSave.saveUuid, note.id) : undefined}
            onedit={onnoteedit
              ? (_noteId, title, content) =>
                  onnoteedit(activeSave.saveUuid, note.id, title, content)
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
  {:else if activeGame}
    <!-- Game level: saves list -->
    <WindowTitleBar
      parents={[
        {
          label: "GAMES",
          onclick: () => {
            navGameId = null;
          },
        },
      ]}
      activeLabel={activeGame.name}
      activeSublabel={activeGame.statusLine}
    />
    <div class="saves-area">
      {#each activeGame.saves as save (save.saveUuid)}
        <div class="save-row-wrap">
          <SaveRow {save} onclick={() => enterSave(save)} />
          {#if showSourceBadges && activeGame.sourceCount > 1}
            <span class="source-badge">{save.sourceName}</span>
          {/if}
        </div>
      {:else}
        <div class="empty-saves">
          <span class="empty-text">No saves detected</span>
        </div>
      {/each}
    </div>
  {:else}
    <!-- Games grid -->
    <WindowTitleBar activeLabel="GAMES" />
    <div class="game-grid">
      {#each games as game (game.gameId)}
        <GameCard
          {game}
          onclick={() => {
            navGameId = game.gameId;
          }}
        />
      {/each}
      <button class="add-game-card" onclick={() => onadd?.()}>
        <span class="add-game-icon">+</span>
        <span class="add-game-label">Add a game</span>
      </button>
    </div>
  {/if}
</Panel>

<style>
  /* -- Game grid ------------------------------------------------ */

  .game-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 16px;
  }

  .add-game-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 12px 10px;
    border-radius: 4px;
    background: transparent;
    border: 1px dashed rgba(74, 90, 173, 0.2);
    min-width: 110px;
    cursor: pointer;
    transition:
      background 0.1s,
      border-color 0.15s;
  }

  .add-game-card:hover {
    background: rgba(74, 90, 173, 0.08);
    border-color: rgba(74, 90, 173, 0.35);
  }

  .add-game-card:focus-visible {
    outline: 2px solid var(--color-blue);
    outline-offset: 2px;
  }

  .add-game-icon {
    font-family: var(--font-pixel);
    font-size: 18px;
    color: var(--color-text-muted);
    margin-bottom: 6px;
  }

  .add-game-label {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    letter-spacing: 0.5px;
  }

  /* -- Saves area ----------------------------------------------- */

  .saves-area {
    padding: 0;
  }

  .save-row-wrap {
    display: flex;
    align-items: center;
    border-bottom: 1px solid rgba(74, 90, 173, 0.06);
  }

  .save-row-wrap :global(.save-row) {
    border-bottom: none;
    flex: 1;
    min-width: 0;
  }

  .source-badge {
    font-family: var(--font-pixel);
    font-size: 6px;
    color: var(--color-text-muted);
    letter-spacing: 0.5px;
    background: rgba(74, 90, 173, 0.08);
    padding: 2px 6px;
    border-radius: 2px;
    border: 1px solid rgba(74, 90, 173, 0.1);
    flex-shrink: 0;
    margin-right: 16px;
  }

  /* -- Notes area ----------------------------------------------- */

  .notes-area {
    padding: 12px 16px;
  }

  /* -- Note creation -------------------------------------------- */

  .create-note-row {
    margin-top: 12px;
  }

  .create-note-form {
    margin-top: 12px;
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

  /* -- Empty states --------------------------------------------- */

  .empty-saves,
  .empty-notes {
    padding: 32px 16px;
    text-align: center;
  }

  .empty-text {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-muted);
  }
</style>
