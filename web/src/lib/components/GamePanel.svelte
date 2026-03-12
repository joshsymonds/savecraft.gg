<!--
  @component
  Game-centric dashboard panel. Shows a grid of games merged across sources.
  Clicking a game opens GameDetailModal (handled by parent).
-->
<script lang="ts">
  import type { Game } from "$lib/types/source";

  import GameCard from "./GameCard.svelte";
  import Panel from "./Panel.svelte";
  import WindowTitleBar from "./WindowTitleBar.svelte";

  let {
    games,
    onadd,
    ongameclick,
    adapterError,
    onreconnect,
    onremove,
  }: {
    games: Game[];
    onadd?: () => void;
    ongameclick?: (game: Game) => void;
    adapterError?: { gameId: string; detail: string };
    onreconnect?: (gameId: string) => void;
    onremove?: (gameId: string) => void;
  } = $props();
</script>

<Panel>
  <WindowTitleBar activeLabel="GAMES" />
  <div class="game-grid">
    {#each games as game (game.gameId)}
      <GameCard
        {game}
        onclick={ongameclick ? () => ongameclick(game) : undefined}
        adapterError={adapterError?.gameId === game.gameId ? adapterError.detail : undefined}
        onreconnect={adapterError?.gameId === game.gameId && onreconnect
          ? () => onreconnect(game.gameId)
          : undefined}
        onremove={adapterError?.gameId === game.gameId && onremove
          ? () => onremove(game.gameId)
          : undefined}
      />
    {/each}
    <button class="add-game-card" onclick={() => onadd?.()}>
      <span class="add-game-icon">+</span>
      <span class="add-game-label">Add a game</span>
    </button>
  </div>
</Panel>

<style>
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
    font-size: 10px;
    color: var(--color-text-muted);
    letter-spacing: 0.5px;
  }
</style>
