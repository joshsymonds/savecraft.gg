<!--
  @component
  Game card: displays a single game in the dashboard game grid.
  Always clickable when onclick is provided.
-->
<script lang="ts">
  import type { Game } from "$lib/types/source";

  let {
    game,
    onclick,
  }: {
    game: Game;
    onclick?: () => void;
  } = $props();

  let clickable = $derived(onclick !== undefined);

  function gameIcon(name: string): string {
    return name.charAt(0).toUpperCase();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="game-card"
  class:clickable
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
  <span class="game-icon">{gameIcon(game.name)}</span>
  <span class="game-name">{game.name}</span>
  {#if game.needsConfig}
    <span class="game-status needs-config">Needs setup</span>
  {:else}
    <span class="game-status">{game.statusLine}</span>
  {/if}
  {#if game.saves.length > 0}
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

  .game-icon {
    font-family: var(--font-pixel);
    font-size: 18px;
    margin-bottom: 6px;
    color: var(--color-gold-light);
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
    font-size: 7px;
    letter-spacing: 1px;
    color: var(--color-yellow, #e8b45a);
  }

  .save-list {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 6px;
    margin-top: 4px;
  }

  .save-name {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
  }
</style>
