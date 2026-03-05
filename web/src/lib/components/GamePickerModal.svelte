<!--
  @component
  Modal overlay showing the full game catalog.
  Search/filter, shows watched status per game.
-->
<script lang="ts">
  import type { PickerGame } from "$lib/types/source";

  import GamePickerCard from "./GamePickerCard.svelte";
  import Panel from "./Panel.svelte";

  let {
    games,
    onselect,
    onclose,
  }: {
    games: PickerGame[];
    onselect?: (game: PickerGame) => void;
    onclose?: () => void;
  } = $props();

  let search = $state("");

  let filtered = $derived(
    search.trim() === ""
      ? games
      : games.filter(
          (g) =>
            g.name.toLowerCase().includes(search.toLowerCase()) ||
            g.description.toLowerCase().includes(search.toLowerCase()),
        ),
  );

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onclose?.();
  }
</script>

<div
  class="modal-backdrop"
  role="dialog"
  aria-label="Add a game"
  tabindex="-1"
  onkeydown={handleKeydown}
>
  <div class="modal-content">
    <Panel>
      <div class="modal-header">
        <span class="modal-title">ADD A GAME</span>
        <button class="modal-close" onclick={() => onclose?.()}>&#x2715;</button>
      </div>
      <div class="modal-search">
        <input type="text" placeholder="Search games..." bind:value={search} class="search-input" />
      </div>
      <div class="modal-list">
        {#each filtered as game (game.gameId)}
          <GamePickerCard {game} onclick={() => onselect?.(game)} />
        {:else}
          <div class="empty-results">
            <span class="empty-text">No games matching "{search}"</span>
          </div>
        {/each}
      </div>
    </Panel>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 7, 26, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fade-in 0.15s ease-out;
  }

  .modal-content {
    width: 520px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    animation: fade-slide-in 0.2s ease-out;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 18px;
    background: rgba(5, 7, 26, 0.4);
    border-bottom: 1px solid rgba(74, 90, 173, 0.12);
  }

  .modal-title {
    font-family: var(--font-pixel);
    font-size: 9px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .modal-close {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 2px;
  }

  .modal-close:hover {
    color: var(--color-text);
    background: rgba(74, 90, 173, 0.15);
  }

  .modal-search {
    padding: 12px 18px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.06);
  }

  .search-input {
    width: 100%;
    padding: 8px 12px;
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text);
    background: rgba(74, 90, 173, 0.06);
    border: 1px solid rgba(74, 90, 173, 0.15);
    border-radius: 3px;
    outline: none;
  }

  .search-input::placeholder {
    color: var(--color-text-muted);
  }

  .search-input:focus {
    border-color: var(--color-blue);
  }

  .modal-list {
    overflow-y: auto;
    max-height: 50vh;
  }

  .empty-results {
    padding: 32px 18px;
    text-align: center;
  }

  .empty-text {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-muted);
  }
</style>
