<!--
  @component
  Modal showing source diagnostics and per-game config.
  Opened by clicking a SourceChip in the SourceStrip.
-->
<script lang="ts">
  import type { Source } from "$lib/types/source";

  import Panel from "./Panel.svelte";
  import StatusDot from "./StatusDot.svelte";

  let {
    source,
    onclose,
  }: {
    source: Source;
    onclose?: () => void;
  } = $props();

  let gameErrors = $derived(source.games.filter((g) => g.error));

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onclose?.();
  }
</script>

<div
  class="modal-backdrop"
  role="dialog"
  aria-label="Source details"
  tabindex="-1"
  onkeydown={handleKeydown}
>
  <div class="modal-content">
    <Panel>
      <!-- Header -->
      <div class="modal-header">
        <div class="header-left">
          <StatusDot status={source.status} size={8} />
          <span class="modal-title">{(source.hostname ?? source.name).toUpperCase()}</span>
          <span class="source-kind">{source.sourceKind}</span>
        </div>
        <button class="modal-close" onclick={() => onclose?.()}>&#x2715;</button>
      </div>

      <!-- Info row -->
      <div class="info-section">
        <div class="info-row">
          <div class="info-item">
            <span class="info-label">STATUS</span>
            <span
              class="info-value"
              class:online={source.status === "online"}
              class:error={source.status === "error"}
              class:offline={source.status === "offline"}
            >
              {source.status.toUpperCase()}
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">LAST SEEN</span>
            <span class="info-value">{source.lastSeen}</span>
          </div>
          {#if source.version}
            <div class="info-item">
              <span class="info-label">VERSION</span>
              <span class="info-value">{source.version}</span>
            </div>
          {/if}
        </div>
      </div>

      <!-- Errors -->
      {#if gameErrors.length > 0}
        <div class="error-section">
          <span class="section-label">ERRORS</span>
          {#each gameErrors as game (game.gameId)}
            <div class="error-item">
              <span class="error-game">{game.name}</span>
              <span class="error-msg">{game.error}</span>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Per-game config (daemon sources only) -->
      {#if source.capabilities.canReceiveConfig}
        <div class="config-section">
          <span class="section-label">GAME CONFIGURATION</span>
          {#each source.games as game (game.gameId)}
            <div class="config-game">
              <div class="config-game-header">
                <span class="config-game-name">{game.name}</span>
                <span
                  class="config-game-status"
                  class:watching={game.status === "watching"}
                  class:game-error={game.status === "error"}
                  class:not-found={game.status === "not_found"}
                >
                  {#if game.status === "watching"}WATCHING{:else if game.status === "error"}ERROR{:else}NOT
                    FOUND{/if}
                </span>
              </div>
              {#if game.path}
                <div class="config-field">
                  <span class="field-label">SAVE PATH</span>
                  <span class="field-value">{game.path}</span>
                </div>
              {/if}
              <div class="config-field">
                <span class="field-label">SAVES</span>
                <span class="field-value"
                  >{game.saves.length} {game.saves.length === 1 ? "save" : "saves"}</span
                >
              </div>
            </div>
          {:else}
            <div class="empty-config">
              <span class="empty-text">No games configured</span>
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
    width: 480px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    animation: fade-slide-in 0.2s ease-out;
  }

  /* -- Header ------------------------------------------------- */

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 18px;
    background: rgba(5, 7, 26, 0.4);
    border-bottom: 1px solid rgba(74, 90, 173, 0.12);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .modal-title {
    font-family: var(--font-pixel);
    font-size: 9px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .source-kind {
    font-family: var(--font-pixel);
    font-size: 6px;
    color: var(--color-text-muted);
    letter-spacing: 0.5px;
    background: rgba(74, 90, 173, 0.08);
    padding: 2px 6px;
    border-radius: 2px;
    border: 1px solid rgba(74, 90, 173, 0.1);
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

  /* -- Info section -------------------------------------------- */

  .info-section {
    padding: 14px 18px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.08);
  }

  .info-row {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .info-label {
    font-family: var(--font-pixel);
    font-size: 6px;
    color: var(--color-text-muted);
    letter-spacing: 1px;
  }

  .info-value {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text);
  }

  .info-value.online {
    color: var(--color-green);
  }

  .info-value.error {
    color: var(--color-yellow);
  }

  .info-value.offline {
    color: var(--color-text-muted);
  }

  /* -- Error section ------------------------------------------ */

  .error-section {
    padding: 14px 18px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.08);
  }

  .section-label {
    display: block;
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-gold);
    letter-spacing: 2px;
    margin-bottom: 10px;
  }

  .error-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    background: rgba(232, 90, 90, 0.06);
    border: 1px solid rgba(232, 90, 90, 0.12);
    border-radius: 3px;
    margin-bottom: 6px;
  }

  .error-item:last-child {
    margin-bottom: 0;
  }

  .error-game {
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-text);
    letter-spacing: 0.5px;
  }

  .error-msg {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-red, #e85a5a);
  }

  /* -- Config section ----------------------------------------- */

  .config-section {
    padding: 14px 18px;
  }

  .config-game {
    padding: 10px 12px;
    background: rgba(74, 90, 173, 0.04);
    border: 1px solid rgba(74, 90, 173, 0.08);
    border-radius: 3px;
    margin-bottom: 8px;
  }

  .config-game:last-child {
    margin-bottom: 0;
  }

  .config-game-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .config-game-name {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text);
    letter-spacing: 0.5px;
  }

  .config-game-status {
    font-family: var(--font-pixel);
    font-size: 6px;
    letter-spacing: 1px;
    padding: 2px 6px;
    border-radius: 2px;
  }

  .config-game-status.watching {
    color: var(--color-green);
    background: rgba(90, 190, 138, 0.1);
    border: 1px solid rgba(90, 190, 138, 0.2);
  }

  .config-game-status.game-error {
    color: var(--color-yellow);
    background: rgba(232, 180, 90, 0.1);
    border: 1px solid rgba(232, 180, 90, 0.2);
  }

  .config-game-status.not-found {
    color: var(--color-text-muted);
    background: rgba(74, 90, 173, 0.06);
    border: 1px solid rgba(74, 90, 173, 0.1);
  }

  .config-field {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 4px;
  }

  .config-field:last-child {
    margin-bottom: 0;
  }

  .field-label {
    font-family: var(--font-pixel);
    font-size: 6px;
    color: var(--color-text-muted);
    letter-spacing: 1px;
    flex-shrink: 0;
  }

  .field-value {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty-config {
    padding: 24px 0;
    text-align: center;
  }

  .empty-text {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-muted);
  }
</style>
