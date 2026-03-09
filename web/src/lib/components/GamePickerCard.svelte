<!--
  @component
  Card within the game picker modal.
  Shows game name, description, and watched/unconfigured status.
-->
<script lang="ts">
  import type { PickerGame } from "$lib/types/source";

  import GameIcon from "./GameIcon.svelte";

  let {
    game,
    onclick,
  }: {
    game: PickerGame;
    onclick?: () => void;
  } = $props();
</script>

<button class="picker-card" class:watched={game.watched} {onclick}>
  <div class="picker-left">
    <GameIcon iconUrl={game.iconUrl} name={game.name} variant={game.isApiGame ? "api" : "default"} />
    <div class="picker-info">
      <span class="picker-name">{game.name}</span>
      <span class="picker-desc">{game.description}</span>
    </div>
  </div>
  <div class="picker-right">
    {#if game.watched}
      <span class="picker-badge watched-badge">
        <span class="check">&#x2713;</span>
        {game.saveCount}
        {game.saveCount === 1 ? "save" : "saves"}
      </span>
    {:else if game.isApiGame}
      <span class="picker-badge api-badge">Connect account</span>
    {:else}
      <span class="picker-badge unconfigured-badge">Not configured</span>
    {/if}
  </div>
</button>

<style>
  .picker-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(74, 90, 173, 0.06);
    cursor: pointer;
    width: 100%;
    text-align: left;
    transition: background 0.1s;
  }

  .picker-card:hover {
    background: rgba(74, 90, 173, 0.1);
  }

  .picker-card:focus-visible {
    background: rgba(74, 90, 173, 0.1);
    outline: 2px solid var(--color-blue);
    outline-offset: -2px;
  }

  .picker-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }

  .picker-info {
    min-width: 0;
    flex: 1;
  }

  .picker-name {
    display: block;
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text);
    letter-spacing: 0.5px;
    line-height: 1.4;
  }

  .picker-desc {
    display: block;
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .picker-right {
    flex-shrink: 0;
    margin-left: 12px;
  }

  .picker-badge {
    font-family: var(--font-pixel);
    font-size: 7px;
    letter-spacing: 1px;
    padding: 4px 8px;
    border-radius: 2px;
  }

  .watched-badge {
    color: var(--color-green);
    background: rgba(90, 190, 138, 0.1);
    border: 1px solid rgba(90, 190, 138, 0.2);
  }

  .check {
    margin-right: 4px;
  }

  .unconfigured-badge {
    color: var(--color-text-muted);
    background: rgba(74, 90, 173, 0.06);
    border: 1px solid rgba(74, 90, 173, 0.1);
  }

  .api-badge {
    color: var(--color-blue, #6ea8fe);
    background: rgba(110, 168, 254, 0.1);
    border: 1px solid rgba(110, 168, 254, 0.2);
  }
</style>
