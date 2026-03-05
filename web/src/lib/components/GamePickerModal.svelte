<!--
  @component
  Modal overlay showing the full game catalog.
  Search/filter, shows watched status per game.
  Unwatched games show inline config form with auto-filled path.
-->
<script lang="ts">
  import type { PickerGame } from "$lib/types/source";

  import GamePickerCard from "./GamePickerCard.svelte";
  import Panel from "./Panel.svelte";
  import TinyButton from "./TinyButton.svelte";

  let {
    games,
    onselect,
    onconfigure,
    onclose,
  }: {
    games: PickerGame[];
    onselect?: (game: PickerGame) => void;
    onconfigure?: (gameId: string, savePath: string) => void;
    onclose?: () => void;
  } = $props();

  let search = $state("");
  let configGame: PickerGame | null = $state(null);
  let configPath = $state("");

  let filtered = $derived(
    search.trim() === ""
      ? games
      : games.filter(
          (g) =>
            g.name.toLowerCase().includes(search.toLowerCase()) ||
            g.description.toLowerCase().includes(search.toLowerCase()),
        ),
  );

  function detectOS(): "windows" | "linux" | "darwin" {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) return "darwin";
    if (ua.includes("win")) return "windows";
    return "linux";
  }

  function handleCardClick(game: PickerGame) {
    if (game.watched) {
      onselect?.(game);
    } else {
      configGame = game;
      const os = detectOS();
      configPath = game.defaultPaths?.[os] ?? "";
    }
  }

  function handleConfigure() {
    if (configGame && configPath.trim()) {
      onconfigure?.(configGame.gameId, configPath.trim());
      configGame = null;
      configPath = "";
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (configGame) {
        configGame = null;
      } else {
        onclose?.();
      }
    }
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
        <span class="modal-title">{configGame ? "CONFIGURE GAME" : "ADD A GAME"}</span>
        <button class="modal-close" onclick={() => onclose?.()}>&#x2715;</button>
      </div>

      {#if configGame}
        <!-- Inline config form for unwatched game -->
        <div class="config-form">
          <div class="config-game-info">
            <span class="config-game-icon">{configGame.name.charAt(0).toUpperCase()}</span>
            <div class="config-game-text">
              <span class="config-game-name">{configGame.name}</span>
              <span class="config-game-desc">{configGame.description}</span>
            </div>
          </div>

          <label class="config-field">
            <span class="field-label">SAVE PATH</span>
            <input
              type="text"
              class="path-input"
              placeholder="Path to save directory..."
              bind:value={configPath}
            />
          </label>

          {#if configGame.defaultPaths}
            <div class="path-hint">
              <span class="hint-label">Default path auto-filled for your OS</span>
            </div>
          {/if}

          <div class="config-actions">
            <TinyButton
              label="CANCEL"
              onclick={() => {
                configGame = null;
              }}
            />
            <TinyButton label="SAVE" onclick={handleConfigure} disabled={!configPath.trim()} />
          </div>
        </div>
      {:else}
        <!-- Game list with search -->
        <div class="modal-search">
          <input
            type="text"
            placeholder="Search games..."
            bind:value={search}
            class="search-input"
          />
        </div>
        <div class="modal-list">
          {#each filtered as game (game.gameId)}
            <GamePickerCard {game} onclick={() => handleCardClick(game)} />
          {:else}
            <div class="empty-results">
              <span class="empty-text">No games matching "{search}"</span>
            </div>
          {/each}
        </div>
      {/if}
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

  /* -- Config form ------------------------------------------- */

  .config-form {
    padding: 18px;
  }

  .config-game-info {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
  }

  .config-game-icon {
    font-family: var(--font-pixel);
    font-size: 14px;
    color: var(--color-gold-light);
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(74, 90, 173, 0.08);
    border: 1px solid rgba(74, 90, 173, 0.15);
    border-radius: 4px;
    flex-shrink: 0;
  }

  .config-game-text {
    min-width: 0;
    flex: 1;
  }

  .config-game-name {
    display: block;
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text);
    letter-spacing: 0.5px;
    line-height: 1.4;
  }

  .config-game-desc {
    display: block;
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
    line-height: 1.3;
  }

  .config-field {
    display: block;
    margin-bottom: 8px;
  }

  .field-label {
    display: block;
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-text-muted);
    letter-spacing: 1px;
    margin-bottom: 6px;
  }

  .path-input {
    width: 100%;
    background: rgba(5, 7, 26, 0.6);
    border: 1px solid rgba(74, 90, 173, 0.2);
    border-radius: 3px;
    padding: 8px 10px;
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text);
    outline: none;
    transition: border-color 0.15s;
  }

  .path-input::placeholder {
    color: var(--color-text-muted);
  }

  .path-input:focus {
    border-color: var(--color-border-light);
  }

  .path-hint {
    margin-bottom: 16px;
  }

  .hint-label {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
  }

  .config-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
