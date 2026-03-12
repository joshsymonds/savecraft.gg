<!--
  @component
  Game card: displays a single game in the dashboard game grid.
  Always clickable when onclick is provided. Shows error banner with
  action buttons when adapterError is set.
-->
<script lang="ts">
  import type { Game } from "$lib/types/source";

  import GameIcon from "./GameIcon.svelte";

  let {
    game,
    onclick,
    adapterError,
    onreconnect,
    onremove,
  }: {
    game: Game;
    onclick?: () => void;
    adapterError?: string;
    onreconnect?: () => void;
    onremove?: () => void;
  } = $props();

  let clickable = $derived(onclick !== undefined);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="game-card"
  class:clickable
  class:has-error={!!adapterError}
  role={clickable ? "button" : undefined}
  tabindex={clickable ? 0 : undefined}
  onclick={clickable ? onclick : undefined}
  onkeydown={clickable
    ? (keyEvent) => {
        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
          keyEvent.preventDefault();
          onclick?.();
        }
      }
    : undefined}
>
  <GameIcon iconUrl={game.iconUrl} name={game.name} size={36} />
  <span class="game-name">{game.name}</span>
  {#if adapterError}
    <span class="game-status error-status">Connection failed</span>
    <div class="error-banner">
      <span class="error-detail">{adapterError}</span>
      <div class="error-actions">
        {#if onreconnect}
          <button
            class="error-btn reconnect"
            onclick={(clickEvent) => {
              clickEvent.stopPropagation();
              onreconnect();
            }}
          >
            Reconnect
          </button>
        {/if}
        {#if onremove}
          <button
            class="error-btn remove"
            onclick={(clickEvent) => {
              clickEvent.stopPropagation();
              onremove();
            }}
          >
            Remove
          </button>
        {/if}
      </div>
    </div>
  {:else if game.needsConfig}
    <span class="game-status needs-config">Needs setup</span>
  {:else}
    <span class="game-status">{game.statusLine}</span>
  {/if}
  {#if !adapterError && game.saves.length > 0}
    <div class="save-list">
      {#each game.saves as save (save.saveUuid)}
        <span class="save-name">{save.saveName}</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .game-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 10px;
    border-radius: 4px;
    background: rgba(74, 90, 173, 0.03);
    border: 1px solid rgba(74, 90, 173, 0.06);
    min-width: 110px;
  }

  .game-card.clickable {
    cursor: pointer;
  }

  .game-card.clickable:hover {
    background: rgba(74, 90, 173, 0.12);
    border-color: rgba(74, 90, 173, 0.25);
  }

  .game-card.clickable:focus-visible {
    background: rgba(74, 90, 173, 0.12);
    border-color: rgba(74, 90, 173, 0.25);
    outline: 2px solid var(--color-blue);
    outline-offset: 2px;
  }

  .game-card.has-error {
    border-color: rgba(220, 80, 80, 0.3);
    background: rgba(220, 80, 80, 0.04);
  }

  .game-name {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-text-dim);
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .game-status {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
  }

  .game-status.needs-config {
    font-family: var(--font-pixel);
    font-size: 9px;
    letter-spacing: 1px;
    color: var(--color-yellow, #e8b45a);
  }

  .game-status.error-status {
    font-family: var(--font-pixel);
    font-size: 9px;
    letter-spacing: 1px;
    color: var(--color-red, #dc5050);
  }

  .error-banner {
    margin-top: 6px;
    width: 100%;
    text-align: center;
  }

  .error-detail {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
    display: block;
    margin-bottom: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
  }

  .error-actions {
    display: flex;
    gap: 6px;
    justify-content: center;
  }

  .error-btn {
    font-family: var(--font-pixel);
    font-size: 10px;
    letter-spacing: 0.5px;
    padding: 3px 8px;
    border-radius: 2px;
    border: none;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .error-btn.reconnect {
    background: rgba(74, 90, 173, 0.15);
    color: var(--color-blue, #4a5aad);
  }

  .error-btn.reconnect:hover {
    background: rgba(74, 90, 173, 0.3);
  }

  .error-btn.remove {
    background: rgba(220, 80, 80, 0.1);
    color: var(--color-red, #dc5050);
  }

  .error-btn.remove:hover {
    background: rgba(220, 80, 80, 0.2);
  }

  .save-list {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 6px;
    margin-top: 4px;
  }

  .save-name {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
  }
</style>
