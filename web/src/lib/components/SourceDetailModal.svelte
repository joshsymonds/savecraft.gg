<!--
  @component
  Modal showing source diagnostics and per-game config.
  Opened by clicking a SourceCard in the SourceCardGrid.
-->
<script lang="ts">
  import { deleteSource, patchGameConfig } from "$lib/api/client";
  import type { Source } from "$lib/types/source";

  import Modal from "./Modal.svelte";
  import StatusDot from "./StatusDot.svelte";

  let {
    source,
    onclose,
  }: {
    source: Source;
    onclose: () => void;
  } = $props();

  let gameErrors = $derived(source.games.filter((g) => g.error));

  // -- Remove source state --
  let confirmingRemove = $state(false);
  let removing = $state(false);

  // -- Per-game toggle state --
  let togglingGame = $state<string | null>(null);

  function handleModalClose() {
    if (confirmingRemove) {
      confirmingRemove = false;
    } else {
      onclose();
    }
  }

  async function handleRemoveSource() {
    removing = true;
    try {
      await deleteSource(source.id);
      onclose();
    } catch {
      removing = false;
    }
  }

  async function handleToggleGame(gameId: string, currentlyEnabled: boolean) {
    togglingGame = gameId;
    try {
      await patchGameConfig(source.id, gameId, { enabled: !currentlyEnabled });
    } catch {
      // Toggle failed — UI will reset via WebSocket state update
    } finally {
      togglingGame = null;
    }
  }

  function isGameEnabled(gameId: string): boolean {
    const game = source.games.find((g) => g.gameId === gameId);
    if (!game) return false;
    return game.status === "watching" || game.status === "error";
  }
</script>

<Modal id="source-detail" onclose={handleModalClose} width="480px" ariaLabel="Source details">
  <!-- Header -->
  <div class="modal-header">
    <div class="header-left">
      <StatusDot status={source.status} size={8} />
      <span class="modal-title">{(source.hostname ?? source.name).toUpperCase()}</span>
      <span class="source-kind">{source.sourceKind}</span>
    </div>
    <button class="modal-close" onclick={() => onclose()}>&#x2715;</button>
  </div>

  <!-- Info row -->
  <div class="info-section">
    <div class="info-row">
      <div class="info-item">
        <span class="info-label">STATUS</span>
        <span
          class="info-value"
          class:online={source.status === "online"}
          class:linked={source.status === "linked"}
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
        <div class="config-game" class:disabled={!isGameEnabled(game.gameId)}>
          <div class="config-game-header">
            <span class="config-game-name">{game.name}</span>
            <div class="config-game-actions">
              <span
                class="config-game-status"
                class:watching={game.status === "watching"}
                class:game-error={game.status === "error"}
                class:not-found={game.status === "not_found"}
              >
                {#if game.status === "watching"}WATCHING{:else if game.status === "error"}ERROR{:else}NOT
                  FOUND{/if}
              </span>
              <button
                class="toggle-btn"
                class:toggle-on={isGameEnabled(game.gameId)}
                class:toggle-off={!isGameEnabled(game.gameId)}
                disabled={togglingGame === game.gameId}
                onclick={() => handleToggleGame(game.gameId, isGameEnabled(game.gameId))}
                title={isGameEnabled(game.gameId) ? "Disable tracking" : "Enable tracking"}
              >
                <span class="toggle-track">
                  <span class="toggle-thumb"></span>
                </span>
              </button>
            </div>
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

  <!-- Remove source -->
  <div class="remove-section">
    {#if confirmingRemove}
      <div class="confirm-box">
        <p class="confirm-text">
          Remove <strong>{source.hostname ?? source.name}</strong> from your account? Your saves will
          be preserved.
        </p>
        <div class="confirm-actions">
          <button
            class="btn-cancel"
            onclick={() => {
              confirmingRemove = false;
            }}
            disabled={removing}
          >
            CANCEL
          </button>
          <button class="btn-remove" onclick={handleRemoveSource} disabled={removing}>
            {removing ? "REMOVING..." : "REMOVE SOURCE"}
          </button>
        </div>
      </div>
    {:else}
      <button
        class="btn-remove-source"
        onclick={() => {
          confirmingRemove = true;
        }}
      >
        REMOVE SOURCE
      </button>
    {/if}
  </div>
</Modal>

<style>
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
    font-size: 11px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .source-kind {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    letter-spacing: 0.5px;
    background: rgba(74, 90, 173, 0.08);
    padding: 2px 6px;
    border-radius: 2px;
    border: 1px solid rgba(74, 90, 173, 0.1);
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
    font-size: 8px;
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

  .info-value.linked {
    color: var(--color-blue);
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
    font-size: 9px;
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
    font-size: 9px;
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

  .config-game.disabled {
    opacity: 0.5;
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

  .config-game-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .config-game-name {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text);
    letter-spacing: 0.5px;
  }

  .config-game-status {
    font-family: var(--font-pixel);
    font-size: 8px;
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

  /* -- Toggle switch ------------------------------------------ */

  .toggle-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
  }

  .toggle-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .toggle-track {
    width: 28px;
    height: 14px;
    border-radius: 7px;
    background: rgba(74, 90, 173, 0.2);
    border: 1px solid rgba(74, 90, 173, 0.3);
    display: flex;
    align-items: center;
    padding: 1px;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .toggle-on .toggle-track {
    background: rgba(90, 190, 138, 0.25);
    border-color: rgba(90, 190, 138, 0.4);
  }

  .toggle-thumb {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-text-muted);
    transition:
      transform 0.15s,
      background 0.15s;
  }

  .toggle-on .toggle-thumb {
    transform: translateX(14px);
    background: var(--color-green);
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
    font-size: 8px;
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

  /* -- Remove source section ---------------------------------- */

  .remove-section {
    padding: 14px 18px;
    border-top: 1px solid rgba(74, 90, 173, 0.08);
  }

  .btn-remove-source {
    font-family: var(--font-pixel);
    font-size: 9px;
    letter-spacing: 1.5px;
    color: var(--color-red, #e85a5a);
    background: none;
    border: 1px solid rgba(232, 90, 90, 0.2);
    border-radius: 3px;
    padding: 8px 14px;
    cursor: pointer;
    width: 100%;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .btn-remove-source:hover {
    background: rgba(232, 90, 90, 0.06);
    border-color: rgba(232, 90, 90, 0.35);
  }

  .confirm-box {
    background: rgba(232, 90, 90, 0.04);
    border: 1px solid rgba(232, 90, 90, 0.15);
    border-radius: 3px;
    padding: 12px 14px;
  }

  .confirm-text {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
    margin: 0 0 12px 0;
    line-height: 1.4;
  }

  .confirm-text strong {
    color: var(--color-text);
  }

  .confirm-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .btn-cancel {
    font-family: var(--font-pixel);
    font-size: 9px;
    letter-spacing: 1px;
    color: var(--color-text-muted);
    background: none;
    border: 1px solid rgba(74, 90, 173, 0.2);
    border-radius: 3px;
    padding: 6px 12px;
    cursor: pointer;
  }

  .btn-cancel:hover {
    color: var(--color-text);
    border-color: rgba(74, 90, 173, 0.4);
  }

  .btn-remove {
    font-family: var(--font-pixel);
    font-size: 9px;
    letter-spacing: 1px;
    color: #fff;
    background: rgba(232, 90, 90, 0.7);
    border: 1px solid rgba(232, 90, 90, 0.5);
    border-radius: 3px;
    padding: 6px 12px;
    cursor: pointer;
  }

  .btn-remove:hover {
    background: rgba(232, 90, 90, 0.85);
  }

  .btn-remove:disabled,
  .btn-cancel:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
