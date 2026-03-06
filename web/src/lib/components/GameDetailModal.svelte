<!--
  @component
  Modal showing game details: save list, status, remove game action.
  Opens on GameCard click. Save clicks open SaveDetailModal (handled by parent).
-->
<script lang="ts">
  import type { Game, Save } from "$lib/types/source";

  import Modal from "./Modal.svelte";
  import SaveRow from "./SaveRow.svelte";
  import WindowTitleBar from "./WindowTitleBar.svelte";

  let {
    game,
    showSourceBadges = false,
    onclose,
    onsaveclick,
    onremovegame,
  }: {
    game: Game;
    showSourceBadges?: boolean;
    onclose: () => void;
    onsaveclick: (save: Save) => void;
    onremovegame?: (gameId: string) => Promise<void>;
  } = $props();

  // -- Remove game --
  let confirmingRemove = $state(false);
  let removeInput = $state("");
  let removing = $state(false);
  let removeError = $state("");

  let nameMatch = $derived(removeInput.trim().toLowerCase() === game.name.toLowerCase());

  function startRemove() {
    confirmingRemove = true;
    removeInput = "";
  }

  function cancelRemove() {
    confirmingRemove = false;
    removeInput = "";
    removeError = "";
  }

  async function handleRemove() {
    if (!onremovegame || !nameMatch) return;
    removing = true;
    removeError = "";
    try {
      await onremovegame(game.gameId);
      onclose();
    } catch (error) {
      removeError = error instanceof Error ? error.message : "Failed to remove game";
    } finally {
      removing = false;
    }
  }

  function handleModalClose() {
    if (confirmingRemove) {
      cancelRemove();
    } else {
      onclose();
    }
  }
</script>

<Modal
  id="game-detail-{game.gameId}"
  tiled
  onclose={handleModalClose}
  width="520px"
  ariaLabel="Game details"
>
  <WindowTitleBar activeLabel={game.name.toUpperCase()} activeSublabel={game.statusLine}>
    {#snippet right()}
      <button class="modal-close" onclick={() => onclose()}>&#x2715;</button>
    {/snippet}
  </WindowTitleBar>

  <div class="saves-area">
    {#each game.saves as save (save.saveUuid)}
      <div class="save-row-wrap">
        <SaveRow {save} onclick={() => onsaveclick(save)} />
        {#if showSourceBadges && game.sourceCount > 1}
          <span class="source-badge">{save.sourceName}</span>
        {/if}
      </div>
    {:else}
      <div class="empty-saves">
        <span class="empty-text">No saves detected</span>
      </div>
    {/each}
  </div>

  {#if confirmingRemove}
    <div class="confirm-section">
      <p class="confirm-warning">
        This will permanently delete <strong
          >{game.saves.length}
          {game.saves.length === 1 ? "save" : "saves"}</strong
        >
        and all associated notes and snapshots for <strong>{game.name}</strong>.
      </p>
      <p class="confirm-prompt">
        Type <strong>{game.name}</strong> to confirm:
      </p>
      <input
        type="text"
        class="confirm-input"
        bind:value={removeInput}
        placeholder={game.name}
        disabled={removing}
      />
      {#if removeError}
        <p class="remove-error">{removeError}</p>
      {/if}
    </div>
  {/if}

  {#snippet footer()}
    {#if confirmingRemove}
      <button class="modal-btn" onclick={cancelRemove} disabled={removing}>CANCEL</button>
      <button class="modal-btn-danger" onclick={handleRemove} disabled={!nameMatch || removing}>
        {removing ? "REMOVING..." : "REMOVE GAME"}
      </button>
    {:else if onremovegame}
      <button class="modal-btn-danger" onclick={startRemove}>REMOVE GAME</button>
      <button class="modal-btn" onclick={() => onclose()}>DISMISS</button>
    {:else}
      <button class="modal-btn" onclick={() => onclose()}>DISMISS</button>
    {/if}
  {/snippet}
</Modal>

<style>
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

  .empty-saves {
    padding: 32px 16px;
    text-align: center;
  }

  .empty-text {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-muted);
  }

  /* -- Remove confirmation -- */

  .confirm-section {
    padding: 14px 18px;
    background: rgba(232, 90, 90, 0.04);
    border-top: 1px solid rgba(232, 90, 90, 0.12);
  }

  .confirm-warning {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
    line-height: 1.5;
    margin: 0 0 12px 0;
  }

  .confirm-warning strong {
    color: var(--color-text);
  }

  .confirm-prompt {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
    margin: 0 0 8px 0;
  }

  .confirm-prompt strong {
    color: var(--color-text);
  }

  .confirm-input {
    width: 100%;
    background: rgba(5, 7, 26, 0.6);
    border: 1px solid rgba(232, 90, 90, 0.25);
    border-radius: 3px;
    padding: 8px 10px;
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text);
    outline: none;
    box-sizing: border-box;
  }

  .confirm-input:focus {
    border-color: rgba(232, 90, 90, 0.5);
  }

  .confirm-input::placeholder {
    color: var(--color-text-muted);
    opacity: 0.4;
  }

  .confirm-input:disabled {
    opacity: 0.5;
  }

  .remove-error {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-red);
    margin: 8px 0 0 0;
  }
</style>
