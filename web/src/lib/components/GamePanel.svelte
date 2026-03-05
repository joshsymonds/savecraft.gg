<!--
  @component
  Game-centric dashboard panel. Shows a grid of games merged across sources.
  Progressive disclosure: games grid -> saves list -> save detail (notes).
  Replaces the source-level navigation of SourceWindow.
-->
<script lang="ts">
  import type { MergedGame, MergedSave, NoteSummary } from "$lib/types/source";

  import GameCard from "./GameCard.svelte";
  import NoteCard from "./NoteCard.svelte";
  import Panel from "./Panel.svelte";
  import SaveRow from "./SaveRow.svelte";
  import WindowTitleBar from "./WindowTitleBar.svelte";

  let {
    games,
    showSourceBadges = false,
    onadd,
    loadNotes,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onnotecreate,
    onnotedelete,
    onnoteedit,
    initialGameId,
    initialSaveUuid,
  }: {
    games: MergedGame[];
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

  async function enterSave(save: MergedSave) {
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
          game={{
            gameId: game.gameId,
            name: game.name,
            status: "watching",
            statusLine: game.statusLine,
            saves: game.saves,
          }}
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
