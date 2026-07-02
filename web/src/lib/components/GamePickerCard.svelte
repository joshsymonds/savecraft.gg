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

  // Unified picker (#17): the tile's affordance follows the game's
  // connection method, not legacy isApiGame/workshopUrl. Priority when a
  // game supports several (hybrid): adapter > mod > daemon > reference.
  function primaryMethod(g: PickerGame): "adapter" | "mod" | "daemon" | "reference" {
    if (g.methods.includes("adapter")) return "adapter";
    if (g.methods.includes("mod")) return "mod";
    if (g.methods.includes("daemon")) return "daemon";
    return "reference";
  }

  function iconVariantFor(
    m: "adapter" | "mod" | "daemon" | "reference",
  ): "api" | "workshop" | "default" {
    if (m === "adapter") return "api";
    if (m === "mod") return "workshop";
    return "default";
  }

  const method = $derived(primaryMethod(game));
  const iconVariant = $derived(iconVariantFor(method));
</script>

<button class="picker-card" class:watched={game.watched} {onclick}>
  <div class="picker-left">
    <GameIcon iconUrl={game.iconUrl} name={game.name} variant={iconVariant} />
    <div class="picker-info">
      <span class="picker-name">{game.name}</span>
      <span class="picker-desc">{game.description}</span>
      {#if !game.watched && method === "adapter" && game.sharedConnectGames?.length}
        <span class="picker-shared-hint"
          >Same account also connects {game.sharedConnectGames.join(" & ")}</span
        >
      {/if}
    </div>
  </div>
  <div class="picker-right">
    {#if game.watched}
      <span class="picker-badge watched-badge">
        <span class="check">&#x2713;</span>
        {game.saveCount}
        {game.saveCount === 1 ? "save" : "saves"}
      </span>
    {:else if method === "adapter"}
      <span class="picker-badge api-badge">Connect account <span class="chev">&rsaquo;</span></span>
    {:else if method === "mod"}
      <span class="picker-badge workshop-badge">Install mod <span class="chev">&rsaquo;</span></span
      >
    {:else if method === "daemon"}
      <span class="picker-badge unconfigured-badge">Set up <span class="chev">&rsaquo;</span></span>
    {:else}
      <span class="picker-badge ready-badge">Ready</span>
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
    font-size: 12px;
    color: var(--color-text);
    letter-spacing: 0.5px;
    line-height: 1.4;
  }

  .picker-desc {
    display: block;
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--color-text-dim);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .picker-shared-hint {
    display: block;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
    margin-top: 2px;
  }

  .picker-right {
    flex-shrink: 0;
    margin-left: 12px;
  }

  .picker-badge {
    font-family: var(--font-pixel);
    font-size: 9px;
    letter-spacing: 1px;
    padding: 5px 10px;
    border-radius: 2px;
  }

  .chev {
    margin-left: 4px;
    opacity: 0.7;
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

  .workshop-badge {
    color: var(--color-steam, #c6d4df);
    background: rgba(198, 212, 223, 0.08);
    border: 1px solid rgba(198, 212, 223, 0.2);
  }

  .ready-badge {
    color: var(--color-green, #5abe8a);
    background: rgba(90, 190, 138, 0.1);
    border: 1px solid rgba(90, 190, 138, 0.22);
  }
</style>
