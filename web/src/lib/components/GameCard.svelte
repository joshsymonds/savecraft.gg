<!--
  @component
  Game card: displays a single game within a device panel's game grid.
  Visual states: watching (active), detected (dimmed + ACTIVATE CTA),
  activating (pulsing, no button), error (yellow).
-->
<script lang="ts">
  import type { DeviceGame } from "$lib/types/device";

  import TinyButton from "./TinyButton.svelte";

  export type ActivateState = "idle" | "activating" | "failed";

  let {
    game,
    onactivate,
    activateState = "idle",
  }: {
    game: DeviceGame;
    onactivate?: (gameId: string) => void;
    activateState?: ActivateState;
  } = $props();

  const ACTIVATE_LABELS: Record<ActivateState, string> = {
    idle: "ACTIVATE",
    activating: "ACTIVATING...",
    failed: "FAILED",
  };

  function gameIcon(name: string): string {
    return name.charAt(0).toUpperCase();
  }
</script>

<div
  class="game-card"
  class:detected={game.status === "detected"}
  class:activating={game.status === "activating"}
>
  <span class="game-icon">{gameIcon(game.name)}</span>
  <span class="game-name">{game.name}</span>
  <span
    class="game-status"
    class:status-green={game.status === "watching"}
    class:status-blue={game.status === "detected" || game.status === "activating"}
    class:status-yellow={game.status === "error"}
  >
    {game.statusLine}
  </span>
  {#if game.status === "watching" && game.saves.length > 0}
    <div class="save-list">
      {#each game.saves as save (save.saveUuid)}
        <span class="save-name">{save.saveName}</span>
      {/each}
    </div>
  {/if}
  {#if game.status === "detected" && onactivate}
    <div class="activate-row">
      <TinyButton
        label={ACTIVATE_LABELS[activateState]}
        onclick={() => onactivate(game.gameId)}
        disabled={activateState !== "idle"}
      />
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

  .game-card.detected {
    opacity: 0.5;
    border-style: dashed;
    border-color: rgba(74, 90, 173, 0.15);
  }

  .game-card.activating {
    opacity: 0.6;
    border-style: dashed;
    border-color: rgba(74, 90, 173, 0.25);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.6;
    }
    50% {
      opacity: 0.85;
    }
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
  }

  .status-green {
    color: var(--color-green);
  }

  .status-blue {
    color: var(--color-blue);
  }

  .status-yellow {
    color: var(--color-yellow);
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

  .activate-row {
    margin-top: 8px;
  }
</style>
