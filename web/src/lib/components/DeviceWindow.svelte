<!--
  @component
  Device window orchestrator: 3-level progressive disclosure.
  Device level → Game level → Save level.
  Wraps Panel + WindowTitleBar + content area.
-->
<script lang="ts">
  import type { Device, DeviceStatus } from "$lib/types/device";
  import { SvelteMap } from "svelte/reactivity";

  import type { ActivateState } from "./GameCard.svelte";
  import GameCard from "./GameCard.svelte";
  import NoteCard from "./NoteCard.svelte";
  import Panel from "./Panel.svelte";
  import SaveRow from "./SaveRow.svelte";
  import TinyButton from "./TinyButton.svelte";
  import type { Parent } from "./WindowTitleBar.svelte";
  import WindowTitleBar from "./WindowTitleBar.svelte";

  let {
    device,
    onrescan,
    ondiscover,
    onconfig,
    onactivate,
    discoveryPending = false,
    initialGameId,
    initialSaveUuid,
  }: {
    device: Device;
    onrescan?: () => void;
    ondiscover?: () => void;
    onconfig?: () => void;
    onactivate?: (gameId: string) => void;
    discoveryPending?: boolean;
    /** Pre-navigate to a game (for storybook). */
    initialGameId?: string;
    /** Pre-navigate to a save (for storybook). Requires initialGameId. */
    initialSaveUuid?: string;
  } = $props();

  // Nav state
  let navGameId = $state<string | null>(initialGameId ?? null);
  let navSaveUuid = $state<string | null>(initialSaveUuid ?? null);

  let gameData = $derived(navGameId ? device.games.find((g) => g.gameId === navGameId) : undefined);
  let saveData = $derived(
    navSaveUuid && gameData ? gameData.saves.find((s) => s.saveUuid === navSaveUuid) : undefined,
  );

  // Activate state tracking
  let activateStates = new SvelteMap<string, ActivateState>();

  function handleActivate(gameId: string): void {
    activateStates.set(gameId, "activating");
    onactivate?.(gameId);
  }

  // Note add form state
  let showAddNote = $state(false);
  let newTitle = $state("");
  let newContent = $state("");

  function handleSaveNote(): void {
    if (!newTitle.trim()) return;
    newTitle = "";
    newContent = "";
    showAddNote = false;
  }

  function handleCancelNote(): void {
    newTitle = "";
    newContent = "";
    showAddNote = false;
  }

  const ACCENT_COLORS: Record<DeviceStatus, string | undefined> = {
    online: "#5abe8a40",
    error: "#e8c44e40",
    offline: undefined,
  };

  const DEVICE_ICONS: Record<DeviceStatus, string> = {
    online: "*",
    error: "!",
    offline: "#",
  };

  // Title bar config
  let parents = $derived.by((): Parent[] => {
    if (saveData && gameData) {
      return [
        {
          icon: DEVICE_ICONS[device.status],
          label: device.name,
          onclick: () => {
            navGameId = null;
            navSaveUuid = null;
          },
        },
        {
          label: gameData.name,
          onclick: () => {
            navSaveUuid = null;
          },
        },
      ];
    }
    if (gameData) {
      return [
        {
          icon: DEVICE_ICONS[device.status],
          label: device.name,
          onclick: () => {
            navGameId = null;
          },
        },
      ];
    }
    return [];
  });

  let activeIcon = $derived.by(() => {
    if (saveData || gameData) return;
    return DEVICE_ICONS[device.status];
  });

  let activeLabel = $derived.by(() => {
    if (saveData) return saveData.saveName;
    if (gameData) return gameData.name;
    return device.name;
  });

  let activeSublabel = $derived.by(() => {
    if (saveData) return saveData.summary;
    if (gameData) return gameData.statusLine;
    const parts: string[] = [];
    if (device.version) parts.push(device.version);
    if (device.status === "offline") parts.push(`last seen ${device.lastSeen}`);
    return parts.join(" · ");
  });

  let statusDot = $derived.by((): "online" | "error" | "offline" | undefined => {
    if (saveData || gameData) return;
    return device.status;
  });

  let visibleGames = $derived(device.games.filter((g) => g.status !== "not_found"));
</script>

<Panel accent={ACCENT_COLORS[device.status]}>
  <WindowTitleBar {parents} {activeIcon} {activeLabel} {activeSublabel} {statusDot}>
    {#snippet right()}
      {#if saveData}
        <div class="save-status-row">
          <span
            class="save-status-icon"
            class:success={saveData.status === "success"}
            class:error={saveData.status === "error"}
          >
            {saveData.status === "success" ? "\u2713" : "\u26A0"}
          </span>
          <span class="save-parsed-time">parsed {saveData.lastUpdated}</span>
        </div>
      {:else if gameData}
        <span
          class="game-status-badge"
          class:watching={gameData.status === "watching"}
          class:error={gameData.status === "error"}
          class:detected={gameData.status === "detected"}
        >
          {#if gameData.status === "watching"}
            ● WATCHING
          {:else if gameData.status === "error"}
            ⚠ ERROR
          {:else}
            ✓ DETECTED
          {/if}
        </span>
      {:else}
        <div class="device-actions">
          <TinyButton
            label={discoveryPending ? "SCANNING..." : "DISCOVER"}
            onclick={ondiscover}
            disabled={device.status === "offline" || discoveryPending}
          />
          <TinyButton label="RESCAN" onclick={onrescan} disabled={device.status === "offline"} />
          <TinyButton label="CONFIG" onclick={onconfig} />
        </div>
      {/if}
    {/snippet}
  </WindowTitleBar>

  {#if saveData}
    <!-- Save level: notes -->
    <div class="save-content">
      <div class="notes-section">
        <div class="notes-header">
          <span class="notes-label">NOTES ({saveData.notes.length}/10)</span>
          {#if !showAddNote && saveData.notes.length < 10}
            <button class="add-note-btn" onclick={() => (showAddNote = true)}>+ ADD NOTE</button>
          {/if}
        </div>

        {#if showAddNote}
          <div class="add-note-form">
            <input
              type="text"
              class="note-title-input"
              placeholder="Note title..."
              bind:value={newTitle}
            />
            <textarea
              class="note-content-input"
              placeholder="Paste build guide, farming goals, notes..."
              rows={5}
              bind:value={newContent}
            ></textarea>
            <div class="note-form-footer">
              <span class="byte-counter">
                {new Blob([newContent]).size.toLocaleString()} / 50,000 bytes
              </span>
              <div class="note-form-actions">
                <button class="note-cancel-btn" onclick={handleCancelNote}>CANCEL</button>
                <button
                  class="note-save-btn"
                  class:disabled={!newTitle.trim()}
                  onclick={handleSaveNote}
                >
                  SAVE NOTE
                </button>
              </div>
            </div>
          </div>
        {/if}

        <div class="notes-list">
          {#each saveData.notes as note (note.id)}
            <NoteCard {note} ondelete={(id: string) => alert(`Delete note ${id}`)} />
          {/each}
        </div>

        {#if saveData.notes.length === 0 && !showAddNote}
          <div class="empty-notes">
            <span class="empty-notes-title">No notes yet</span>
            <span class="empty-notes-sub">
              Add build guides, farming goals, or let Claude create notes in chat.
            </span>
          </div>
        {/if}
      </div>
    </div>
  {:else if gameData}
    <!-- Game level: save rows -->
    <div class="game-content">
      <div class="save-list">
        {#each gameData.saves as save (save.saveUuid)}
          <SaveRow
            {save}
            onclick={() => {
              navSaveUuid = save.saveUuid;
            }}
          />
        {/each}
      </div>
      {#if gameData.error}
        <div class="error-banner">
          <span class="error-badge">⚠ ERROR</span>
          <span class="error-message">{gameData.error}</span>
        </div>
      {/if}
      {#if gameData.path}
        <div class="path-footer">
          <span class="path-text">{gameData.path}</span>
        </div>
      {/if}
    </div>
  {:else}
    <!-- Device level: game grid -->
    <div class="game-grid">
      {#each visibleGames as game (game.gameId)}
        <GameCard
          {game}
          activateState={activateStates.get(game.gameId) ?? "idle"}
          onactivate={(gameId: string) => {
            handleActivate(gameId);
          }}
          onclick={() => {
            navGameId = game.gameId;
          }}
        />
      {/each}
      {#if visibleGames.length === 0}
        <button class="add-game-card" disabled>
          <span class="add-game-icon">+</span>
          <span class="add-game-label">Add a game...</span>
        </button>
      {/if}
    </div>
  {/if}
</Panel>

<style>
  /* -- Device actions ---------------------------------------- */

  .device-actions {
    display: flex;
    gap: 5px;
  }

  /* -- Game grid (device level) ------------------------------ */

  .game-grid {
    padding: 14px 12px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
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
    min-height: 80px;
    cursor: not-allowed;
    opacity: 0.5;
  }

  .add-game-icon {
    font-family: var(--font-pixel);
    font-size: 22px;
    color: var(--color-text-muted);
    margin-bottom: 4px;
  }

  .add-game-label {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-muted);
    letter-spacing: 0.5px;
  }

  /* -- Game level -------------------------------------------- */

  .game-content {
    animation: fadeIn 0.18s ease-out;
  }

  .save-list {
    padding: 4px 0;
  }

  .error-banner {
    margin: 4px 14px 8px;
    padding: 8px 12px;
    background: rgba(232, 196, 78, 0.04);
    border: 1px solid rgba(232, 196, 78, 0.13);
    border-radius: 3px;
  }

  .error-badge {
    display: block;
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-yellow);
    letter-spacing: 1px;
    margin-bottom: 4px;
  }

  .error-message {
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--color-yellow);
  }

  .path-footer {
    padding: 8px 16px 12px;
    border-top: 1px solid rgba(74, 90, 173, 0.08);
    margin-top: 4px;
  }

  .path-text {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
  }

  /* -- Game status badge ------------------------------------- */

  .game-status-badge {
    font-family: var(--font-pixel);
    font-size: 10px;
    border-radius: 2px;
    padding: 3px 8px;
    letter-spacing: 1px;
  }

  .game-status-badge.watching {
    color: var(--color-green);
    background: rgba(90, 190, 138, 0.07);
    border: 1px solid rgba(90, 190, 138, 0.19);
  }

  .game-status-badge.error {
    color: var(--color-yellow);
    background: rgba(232, 196, 78, 0.07);
    border: 1px solid rgba(232, 196, 78, 0.19);
  }

  .game-status-badge.detected {
    color: var(--color-blue);
    background: rgba(74, 154, 234, 0.07);
    border: 1px solid rgba(74, 154, 234, 0.19);
  }

  /* -- Save level status ------------------------------------- */

  .save-status-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .save-status-icon {
    font-family: var(--font-pixel);
    font-size: 10px;
  }

  .save-status-icon.success {
    color: var(--color-green);
  }

  .save-status-icon.error {
    color: var(--color-yellow);
  }

  .save-parsed-time {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
  }

  /* -- Save level: notes ------------------------------------- */

  .save-content {
    animation: fadeIn 0.18s ease-out;
  }

  .notes-section {
    padding: 16px;
  }

  .notes-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .notes-label {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .add-note-btn {
    background: rgba(200, 168, 78, 0.07);
    border: 1px solid rgba(200, 168, 78, 0.19);
    border-radius: 3px;
    padding: 5px 12px;
    cursor: pointer;
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-gold);
    letter-spacing: 1px;
    transition: all 0.15s;
  }

  .add-note-btn:hover {
    background: rgba(200, 168, 78, 0.13);
  }

  .notes-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* -- Add note form ----------------------------------------- */

  .add-note-form {
    padding: 14px;
    margin-bottom: 12px;
    background: rgba(200, 168, 78, 0.024);
    border: 1px solid rgba(200, 168, 78, 0.13);
    border-radius: 4px;
    animation: fadeIn 0.15s ease-out;
  }

  .note-title-input {
    width: 100%;
    background: rgba(5, 7, 26, 0.6);
    border: 1px solid rgba(74, 90, 173, 0.3);
    border-radius: 3px;
    padding: 8px 10px;
    margin-bottom: 8px;
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text);
    outline: none;
    letter-spacing: 0.5px;
    box-sizing: border-box;
  }

  .note-title-input:focus {
    border-color: var(--color-gold);
  }

  .note-content-input {
    width: 100%;
    background: rgba(5, 7, 26, 0.6);
    border: 1px solid rgba(74, 90, 173, 0.3);
    border-radius: 3px;
    padding: 8px 10px;
    margin-bottom: 8px;
    resize: vertical;
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--color-text);
    outline: none;
    line-height: 1.4;
    box-sizing: border-box;
  }

  .note-content-input:focus {
    border-color: var(--color-gold);
  }

  .note-form-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .byte-counter {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
  }

  .note-form-actions {
    display: flex;
    gap: 6px;
  }

  .note-cancel-btn {
    background: rgba(74, 90, 173, 0.1);
    border: 1px solid rgba(74, 90, 173, 0.25);
    border-radius: 3px;
    padding: 5px 12px;
    cursor: pointer;
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-dim);
    letter-spacing: 1px;
  }

  .note-save-btn {
    background: rgba(200, 168, 78, 0.13);
    border: 1px solid rgba(200, 168, 78, 0.25);
    border-radius: 3px;
    padding: 5px 12px;
    cursor: pointer;
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-gold);
    letter-spacing: 1px;
  }

  .note-save-btn.disabled {
    opacity: 0.4;
  }

  /* -- Empty state ------------------------------------------- */

  .empty-notes {
    text-align: center;
    padding: 32px 16px;
    border: 1px dashed rgba(74, 90, 173, 0.2);
    border-radius: 4px;
  }

  .empty-notes-title {
    display: block;
    font-family: var(--font-body);
    font-size: 20px;
    color: var(--color-text-muted);
    margin-bottom: 6px;
  }

  .empty-notes-sub {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-muted);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
