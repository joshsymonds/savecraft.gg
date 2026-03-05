<!--
  @component
  Source window orchestrator: 3-level progressive disclosure.
  Source level → Game level → Save level.
  Wraps Panel + WindowTitleBar + content area.
-->
<script lang="ts">
  import { fetchSourceConfig, type GameConfigInput, saveSourceConfig } from "$lib/api/client";
  import { clearTestPathResult, testPathResult } from "$lib/stores/testpath";
  import type { NoteSummary, Source, SourceStatus } from "$lib/types/source";
  import { send } from "$lib/ws/client";

  import GameCard from "./GameCard.svelte";
  import NoteCard from "./NoteCard.svelte";
  import Panel from "./Panel.svelte";
  import SaveRow from "./SaveRow.svelte";
  import TinyButton from "./TinyButton.svelte";
  import type { Parent } from "./WindowTitleBar.svelte";
  import WindowTitleBar from "./WindowTitleBar.svelte";

  let {
    source,
    onrescan,
    onnotecreate,
    onnotedelete,
    onnoteedit,
    loadNotes,
    justLinked = false,
    initialGameId,
    initialSaveUuid,
  }: {
    source: Source;
    onrescan?: () => void;
    /** Called when user submits the add-note form. */
    onnotecreate?: (saveUuid: string, title: string, content: string) => Promise<void>;
    /** Called when user confirms note deletion. */
    onnotedelete?: (saveUuid: string, noteId: string) => Promise<void>;
    /** Called when user edits a note inline. */
    onnoteedit?: (
      saveUuid: string,
      noteId: string,
      title: string,
      content: string,
    ) => Promise<void>;
    /** Fetch notes for a save from the API. */
    loadNotes?: (saveUuid: string) => Promise<NoteSummary[]>;
    /** Show transient "LINKED" success banner (auto-dismisses after 5 s). */
    justLinked?: boolean;
    /** Pre-navigate to a game (for storybook). */
    initialGameId?: string;
    /** Pre-navigate to a save (for storybook). Requires initialGameId. */
    initialSaveUuid?: string;
  } = $props();

  // Show linked banner while justLinked is true (store auto-resets after 5 s)
  let showLinkedBanner = $derived(justLinked);

  // Nav state — intentionally captures initial values (Storybook pre-navigation only)
  // svelte-ignore state_referenced_locally
  let navGameId = $state<string | null>(initialGameId ?? null);
  // svelte-ignore state_referenced_locally
  let navSaveUuid = $state<string | null>(initialSaveUuid ?? null);

  let gameData = $derived(navGameId ? source.games.find((g) => g.gameId === navGameId) : undefined);
  let saveData = $derived(
    navSaveUuid && gameData ? gameData.saves.find((s) => s.saveUuid === navSaveUuid) : undefined,
  );

  // Async notes state
  let loadedNotes = $state<NoteSummary[]>([]);
  let notesLoading = $state(false);
  let notesError = $state<string | null>(null);
  let notesRequestId = 0;

  async function refreshNotes(saveUuid: string): Promise<void> {
    if (!loadNotes) return;
    const requestId = ++notesRequestId;
    notesLoading = true;
    notesError = null;
    try {
      const notes = await loadNotes(saveUuid);
      if (requestId !== notesRequestId) return; // stale
      loadedNotes = notes;
    } catch (error) {
      if (requestId !== notesRequestId) return; // stale
      notesError = error instanceof Error ? error.message : "Failed to load notes";
    } finally {
      if (requestId === notesRequestId) {
        notesLoading = false;
      }
    }
  }

  $effect(() => {
    if (navSaveUuid) {
      void refreshNotes(navSaveUuid);
    } else {
      notesRequestId++;
      loadedNotes = [];
      notesError = null;
      notesLoading = false;
    }
  });

  // Note add form state
  let showAddNote = $state(false);
  let newTitle = $state("");
  let newContent = $state("");
  let contentBytes = $derived(new Blob([newContent]).size);

  async function handleSaveNote(): Promise<void> {
    if (!newTitle.trim() || !navSaveUuid) return;
    try {
      await onnotecreate?.(navSaveUuid, newTitle.trim(), newContent);
      newTitle = "";
      newContent = "";
      showAddNote = false;
      await refreshNotes(navSaveUuid);
    } catch (error) {
      notesError = error instanceof Error ? error.message : "Failed to create note";
    }
  }

  function handleCancelNote(): void {
    newTitle = "";
    newContent = "";
    showAddNote = false;
  }

  // Game config state
  let showSettings = $state(false);
  let configLoading = $state(false);
  let configSaving = $state(false);
  let configError = $state<string | null>(null);
  let configSavePath = $state("");
  let configEnabled = $state(true);
  let configFileExtensions = $state<string[]>([]);
  let allGamesConfig = $state<Record<string, GameConfigInput>>({});

  // Track which game's test result we're showing
  let configTestResult = $derived.by(() => {
    const result = $testPathResult;
    if (!result || !gameData) return null;
    if (result.gameId !== gameData.gameId) return null;
    return result;
  });

  async function loadGameConfig(): Promise<void> {
    if (!gameData) return;
    configLoading = true;
    configError = null;
    clearTestPathResult();
    try {
      const config = await fetchSourceConfig(source.id);
      allGamesConfig = config;
      const gameConfig = config[gameData.gameId];
      if (gameConfig) {
        configSavePath = gameConfig.savePath;
        configEnabled = gameConfig.enabled;
        configFileExtensions = gameConfig.fileExtensions;
      } else {
        configSavePath = gameData.path ?? "";
        configEnabled = true;
        configFileExtensions = [];
      }
    } catch (err) {
      configError = err instanceof Error ? err.message : "Failed to load config";
    } finally {
      configLoading = false;
    }
  }

  // Load config when navigating to a game
  $effect(() => {
    if (navGameId) {
      showSettings = false;
      void loadGameConfig();
    }
  });

  async function handleSaveConfig(): Promise<void> {
    if (!gameData) return;
    configSaving = true;
    configError = null;
    try {
      const updated = {
        ...allGamesConfig,
        [gameData.gameId]: {
          savePath: configSavePath,
          enabled: configEnabled,
          fileExtensions: configFileExtensions,
        },
      };
      await saveSourceConfig(source.id, updated);
      allGamesConfig = updated;
      configSaving = false;
    } catch (err) {
      configError = err instanceof Error ? err.message : "Failed to save config";
      configSaving = false;
    }
  }

  function handleTestPath(): void {
    if (!gameData || !configSavePath) return;
    clearTestPathResult();
    send(JSON.stringify({ testPath: { gameId: gameData.gameId, path: configSavePath } }));
  }

  const ACCENT_COLORS: Record<SourceStatus, string | undefined> = {
    online: "#5abe8a40",
    error: "#e8c44e40",
    offline: undefined,
  };

  const SOURCE_ICON = "🖥";

  // Title bar config
  let parents = $derived.by((): Parent[] => {
    if (saveData && gameData) {
      return [
        {
          icon: SOURCE_ICON,
          label: source.name,
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
          icon: SOURCE_ICON,
          label: source.name,
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
    return SOURCE_ICON;
  });

  let activeLabel = $derived.by(() => {
    if (saveData) return saveData.saveName;
    if (gameData) return gameData.name;
    return source.name;
  });

  let activeSublabel = $derived.by(() => {
    if (saveData) return saveData.summary;
    if (gameData) return gameData.statusLine;
    const parts: string[] = [];
    if (source.version) parts.push(source.version);
    if (source.status === "offline") parts.push(`last seen ${source.lastSeen}`);
    return parts.join(" · ");
  });

  let statusDot = $derived.by((): "online" | "error" | "offline" | undefined => {
    if (saveData || gameData) return;
    return source.status;
  });
</script>

<Panel accent={ACCENT_COLORS[source.status]}>
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
        >
          {#if gameData.status === "watching"}
            ● WATCHING
          {:else if gameData.status === "error"}
            ⚠ ERROR
          {/if}
        </span>
      {:else if source.capabilities.canRescan}
        <div class="source-actions">
          <TinyButton label="RESCAN" onclick={onrescan} disabled={source.status === "offline"} />
        </div>
      {/if}
    {/snippet}
  </WindowTitleBar>

  {#if showLinkedBanner}
    <div class="linked-banner">
      <span class="linked-icon">&#10003;</span>
      <span class="linked-label">SOURCE LINKED</span>
    </div>
  {/if}

  {#if saveData}
    <!-- Save level: notes -->
    <div class="save-content">
      <div class="notes-section">
        <div class="notes-header">
          <span class="notes-label">NOTES ({loadedNotes.length}/10)</span>
          {#if !showAddNote && loadedNotes.length < 10}
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
                {contentBytes.toLocaleString()} / 50,000 bytes
              </span>
              <div class="note-form-actions">
                <button class="note-cancel-btn" onclick={handleCancelNote}>CANCEL</button>
                <button class="note-save-btn" disabled={!newTitle.trim()} onclick={handleSaveNote}>
                  SAVE NOTE
                </button>
              </div>
            </div>
          </div>
        {/if}

        {#if notesLoading}
          <div class="notes-loading">Loading notes...</div>
        {:else if notesError}
          <div class="notes-error">{notesError}</div>
        {/if}

        <div class="notes-list">
          {#each loadedNotes as note (note.id)}
            <NoteCard
              {note}
              ondelete={async (noteId) => {
                if (!navSaveUuid) return;
                try {
                  await onnotedelete?.(navSaveUuid, noteId);
                  await refreshNotes(navSaveUuid);
                } catch (error) {
                  notesError = error instanceof Error ? error.message : "Failed to delete note";
                }
              }}
              onedit={async (noteId, title, content) => {
                if (!navSaveUuid) return;
                try {
                  await onnoteedit?.(navSaveUuid, noteId, title, content);
                  await refreshNotes(navSaveUuid);
                } catch (error) {
                  notesError = error instanceof Error ? error.message : "Failed to update note";
                }
              }}
            />
          {/each}
        </div>

        {#if loadedNotes.length === 0 && !showAddNote && !notesLoading}
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
          <span class="path-text">📁 {gameData.path}</span>
        </div>
      {/if}

      <!-- Inline game settings (only for sources that accept config) -->
      {#if source.capabilities.canReceiveConfig}
        <div class="settings-section">
          <button class="settings-toggle" onclick={() => (showSettings = !showSettings)}>
            <span class="settings-label">SETTINGS</span>
            <span class="settings-chevron" class:open={showSettings}>▸</span>
          </button>

          {#if showSettings}
            <div class="settings-content">
              {#if configLoading}
                <div class="settings-loading">Loading config...</div>
              {:else}
                {#if configError}
                  <div class="settings-error">{configError}</div>
                {/if}

                <label class="settings-field">
                  <span class="field-label">SAVE PATH</span>
                  <div class="path-row">
                    <input
                      class="path-input"
                      type="text"
                      placeholder="Save directory path..."
                      bind:value={configSavePath}
                    />
                    <TinyButton label="TEST" onclick={handleTestPath} />
                  </div>
                </label>

                {#if configTestResult}
                  <div
                    class="test-result"
                    class:valid={configTestResult.valid}
                    class:invalid={!configTestResult.valid}
                  >
                    {#if configTestResult.valid}
                      Found {configTestResult.filesFound} file{configTestResult.filesFound === 1
                        ? ""
                        : "s"}
                    {:else}
                      No matching files found
                    {/if}
                  </div>
                {/if}

                {#if configFileExtensions.length > 0}
                  <div class="settings-field">
                    <span class="field-label">FILE EXTENSIONS</span>
                    <div class="ext-chips">
                      {#each configFileExtensions as extension (extension)}
                        <span class="ext-chip">{extension}</span>
                      {/each}
                    </div>
                  </div>
                {/if}

                <label class="settings-field enabled-toggle">
                  <input type="checkbox" bind:checked={configEnabled} />
                  <span class="toggle-label">Enabled</span>
                </label>

                <div class="settings-actions">
                  <TinyButton
                    label={configSaving ? "SAVING..." : "SAVE"}
                    onclick={handleSaveConfig}
                    disabled={configSaving}
                  />
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <!-- Source level: game grid -->
    <div class="game-grid">
      {#each source.games as game (game.gameId)}
        <GameCard
          {game}
          onclick={() => {
            navGameId = game.gameId;
          }}
        />
      {/each}
      {#if source.games.length === 0}
        <div class="add-game-card" aria-hidden="true">
          <span class="add-game-icon">+</span>
          <span class="add-game-label">Add a game...</span>
        </div>
      {/if}
    </div>
  {/if}
</Panel>

<style>
  /* -- Source actions ---------------------------------------- */

  .source-actions {
    display: flex;
    gap: 5px;
  }

  /* -- Game grid (source level) ------------------------------ */

  .game-grid {
    padding: 14px 12px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
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

  /* -- Inline game settings ---------------------------------- */

  .settings-section {
    border-top: 1px solid rgba(74, 90, 173, 0.08);
    margin-top: 4px;
  }

  .settings-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 10px 16px;
    background: none;
    border: none;
    cursor: pointer;
    transition: background 0.15s;
  }

  .settings-toggle:hover {
    background: rgba(74, 90, 173, 0.04);
  }

  .settings-label {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .settings-chevron {
    font-size: 10px;
    color: var(--color-text-muted);
    transition: transform 0.15s;
  }

  .settings-chevron.open {
    transform: rotate(90deg);
  }

  .settings-content {
    padding: 0 16px 14px;
    animation: fadeIn 0.15s ease-out;
  }

  .settings-loading {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-muted);
    padding: 8px 0;
  }

  .settings-error {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-red, #e85a5a);
    padding: 6px 0;
    margin-bottom: 8px;
  }

  .settings-field {
    display: block;
    margin-bottom: 12px;
  }

  .field-label {
    display: block;
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-dim);
    letter-spacing: 1px;
    margin-bottom: 6px;
  }

  .path-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .path-input {
    flex: 1;
    background: rgba(5, 7, 26, 0.6);
    border: 1px solid rgba(74, 90, 173, 0.2);
    border-radius: 3px;
    padding: 6px 10px;
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

  .test-result {
    font-family: var(--font-body);
    font-size: 15px;
    margin-bottom: 12px;
    padding: 4px 0;
  }

  .test-result.valid {
    color: var(--color-green);
  }

  .test-result.invalid {
    color: var(--color-yellow);
  }

  .ext-chips {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .ext-chip {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
    background: rgba(74, 90, 173, 0.08);
    border: 1px solid rgba(74, 90, 173, 0.15);
    border-radius: 3px;
    padding: 1px 6px;
  }

  .enabled-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }

  .enabled-toggle input[type="checkbox"] {
    accent-color: var(--color-gold);
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .toggle-label {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text);
  }

  .settings-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 4px;
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

  .note-save-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .notes-loading {
    text-align: center;
    padding: 16px;
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-muted);
  }

  .notes-error {
    padding: 8px 12px;
    margin-bottom: 8px;
    background: rgba(232, 90, 90, 0.04);
    border: 1px solid rgba(232, 90, 90, 0.13);
    border-radius: 3px;
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-red, #e85a5a);
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

  /* -- Linked success banner ---------------------------------- */

  .linked-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: rgba(90, 190, 138, 0.06);
    border-bottom: 1px solid rgba(90, 190, 138, 0.15);
    animation: fadeIn 0.3s ease-out;
  }

  .linked-icon {
    font-size: 14px;
    color: var(--color-green);
    filter: drop-shadow(0 0 4px rgba(90, 190, 138, 0.4));
  }

  .linked-label {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-green);
    letter-spacing: 2px;
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
