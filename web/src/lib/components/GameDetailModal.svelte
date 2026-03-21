<!--
  @component
  Unified game modal: save list, source status, config, remove game.
  Opens on GameCard click. Save clicks open SaveDetailModal (handled by parent).
  Source clicks open SourceEditModal stacked on top.
-->
<script lang="ts">
  import type {
    AvailableSource,
    Game,
    GameSourceEntry,
    RemovedSave,
    Save,
    TestPathResult,
    ValidationState,
  } from "$lib/types/source";
  import { defaultPathForPlatform } from "$lib/utils/platform";

  import DropdownMenu from "./DropdownMenu.svelte";
  import Modal from "./Modal.svelte";
  import SaveRow from "./SaveRow.svelte";
  import SourceEditModal from "./SourceEditModal.svelte";
  import StatusDot from "./StatusDot.svelte";
  import WindowTitleBar from "./WindowTitleBar.svelte";

  let {
    game,
    showSourceBadges = false,
    availableSources = [],
    defaultPaths,
    onclose,
    onsaveclick,
    onremovegame,
    onsave,
    ontestpath,
    testPathResult = null,
    validationState = "idle",
    onremovesource,
    removedSaves = [],
    onrestoresave,
  }: {
    game: Game;
    showSourceBadges?: boolean;
    availableSources?: AvailableSource[];
    defaultPaths?: { windows?: string; linux?: string; darwin?: string };
    onclose: () => void;
    onsaveclick: (save: Save) => void;
    onremovegame?: (gameId: string) => Promise<void>;
    onsave?: (sourceId: string, savePath: string) => Promise<void>;
    ontestpath?: (sourceId: string, path: string) => void;
    testPathResult?: TestPathResult | null;
    validationState?: ValidationState;
    onremovesource?: (sourceId: string) => Promise<void>;
    removedSaves?: RemovedSave[];
    onrestoresave?: (saveUuid: string) => Promise<void>;
  } = $props();

  // -- Stacked source editor state --

  let editingSourceId: string | null = $state(null);
  let editingSourceName: string | null = $state(null);
  let editingPath: string = $state("");

  // -- Dropdown options derived from availableSources --
  let dropdownOptions = $derived(
    availableSources.map((s) => ({
      id: s.id,
      label: s.name,
      sublabel: s.hostname ?? undefined,
    })),
  );

  function statusToDot(status: GameSourceEntry["status"]): "online" | "error" | "offline" {
    if (status === "watching") return "online";
    if (status === "error") return "error";
    return "offline";
  }

  function statusLabel(status: GameSourceEntry["status"]): string {
    if (status === "watching") return "WATCHING";
    if (status === "error") return "ERROR";
    return "NOT FOUND";
  }

  function defaultPathForSource(sourceId: string): string {
    const source = availableSources.find((s) => s.id === sourceId);
    return defaultPathForPlatform(source?.platform, defaultPaths);
  }

  function openEditor(sourceId: string, sourceName: string, path: string) {
    editingSourceId = sourceId;
    editingSourceName = sourceName;
    editingPath = path;
  }

  function handleSourceClick(source: GameSourceEntry) {
    if (source.sourceKind === "adapter") return;
    openEditor(
      source.sourceId,
      source.sourceName,
      source.path ?? defaultPathForSource(source.sourceId),
    );
  }

  function handleDropdownPick(option: { id: string; label: string }) {
    openEditor(option.id, option.label, defaultPathForSource(option.id));
  }

  function closeEditor() {
    editingSourceId = null;
    editingSourceName = null;
    editingPath = "";
  }

  // -- Restore save --
  let restoringId: string | null = $state(null);

  async function handleRestore(saveUuid: string) {
    if (!onrestoresave) return;
    restoringId = saveUuid;
    try {
      await onrestoresave(saveUuid);
    } finally {
      restoringId = null;
    }
  }

  // -- Remove game --
  let confirmingRemove = $state(false);
  let removeInput = $state("");
  let removing = $state(false);
  let removeError = $state("");

  let nameMatch = $derived(removeInput.trim().toLowerCase() === game.name.toLowerCase());

  function startRemove() {
    confirmingRemove = true;
    removeInput = "";
  }

  function cancelRemove() {
    confirmingRemove = false;
    removeInput = "";
    removeError = "";
  }

  async function handleRemove() {
    if (!onremovegame || !nameMatch) return;
    removing = true;
    removeError = "";
    try {
      await onremovegame(game.gameId);
      onclose();
    } catch (error) {
      removeError = error instanceof Error ? error.message : "Failed to remove game";
    } finally {
      removing = false;
    }
  }

  function handleModalClose() {
    if (confirmingRemove) {
      cancelRemove();
    } else {
      onclose();
    }
  }
</script>

<Modal
  id="game-detail-{game.gameId}"
  tiled
  onclose={handleModalClose}
  width="520px"
  ariaLabel="Game details"
>
  <WindowTitleBar activeLabel={game.name.toUpperCase()} activeSublabel={game.statusLine}>
    {#snippet right()}
      <button class="modal-close" onclick={() => onclose()}>&#x2715;</button>
    {/snippet}
  </WindowTitleBar>

  <div class="saves-area">
    {#each game.saves as save (save.saveUuid)}
      <div class="save-row-wrap">
        <SaveRow {save} onclick={() => onsaveclick(save)} />
        {#if showSourceBadges && game.sourceCount > 1}
          <span class="source-badge">{save.sourceName}</span>
        {/if}
      </div>
    {:else}
      <div class="empty-saves">
        <span class="empty-text">No saves detected</span>
      </div>
    {/each}
  </div>

  <!-- Sources section -->
  {#if game.sources.length > 0 || availableSources.length > 0}
    <div class="sources-section">
      <div class="sources-header">
        <span class="section-label">SOURCES</span>
        {#if availableSources.length > 0 && !game.sources.some((s) => s.sourceKind === "adapter")}
          <DropdownMenu label="ADD SOURCE" options={dropdownOptions} onpick={handleDropdownPick} />
        {/if}
      </div>

      {#each game.sources as source (source.sourceId)}
        <button
          class="source-row"
          class:adapter-source={source.sourceKind === "adapter"}
          onclick={() => handleSourceClick(source)}
        >
          <div class="source-row-left">
            <StatusDot status={statusToDot(source.status)} size={6} />
            <span class="source-name">{source.sourceName}</span>
          </div>
          <div class="source-row-right">
            {#if source.sourceKind === "adapter"}
              <span class="status-badge api-connected">API</span>
            {:else}
              <span
                class="status-badge"
                class:watching={source.status === "watching"}
                class:error-status={source.status === "error"}
                class:not-found={source.status === "not_found"}
              >
                {statusLabel(source.status)}
              </span>
            {/if}
          </div>
        </button>
        {#if source.sourceKind !== "adapter" && source.path}
          <div class="source-path">{source.path}</div>
        {/if}
        {#if source.error}
          <div class="source-error">{source.error}</div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- Removed saves section -->
  {#if removedSaves.length > 0}
    <div class="removed-section">
      <div class="removed-header">
        <span class="section-label">REMOVED SAVES</span>
        <span class="removed-count">{removedSaves.length}</span>
      </div>

      {#each removedSaves as rs (rs.saveUuid)}
        <div class="removed-row">
          <div class="removed-info">
            <span class="removed-name">{rs.saveName}</span>
            <span class="removed-summary">{rs.summary}</span>
            <div class="removed-meta">
              <span class="removed-date">Removed {rs.removedAt}</span>
              {#if rs.noteCount > 0}
                <span class="removed-notes"
                  >{rs.noteCount} {rs.noteCount === 1 ? "note" : "notes"} preserved</span
                >
              {/if}
            </div>
          </div>
          {#if onrestoresave}
            <button
              class="restore-btn"
              disabled={restoringId === rs.saveUuid}
              onclick={() => handleRestore(rs.saveUuid)}
            >
              {restoringId === rs.saveUuid ? "..." : "RESTORE"}
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if confirmingRemove}
    <div class="confirm-section">
      <p class="confirm-warning">
        This will permanently delete <strong
          >{game.saves.length}
          {game.saves.length === 1 ? "save" : "saves"}</strong
        >
        and all associated notes and snapshots for <strong>{game.name}</strong>.
      </p>
      <p class="confirm-prompt">
        Type <strong>{game.name}</strong> to confirm:
      </p>
      <input
        type="text"
        class="confirm-input"
        bind:value={removeInput}
        placeholder={game.name}
        disabled={removing}
      />
      {#if removeError}
        <p class="remove-error">{removeError}</p>
      {/if}
    </div>
  {/if}

  {#snippet footer()}
    {#if confirmingRemove}
      <button class="modal-btn" onclick={cancelRemove} disabled={removing}>CANCEL</button>
      <button class="modal-btn-danger" onclick={handleRemove} disabled={!nameMatch || removing}>
        {removing ? "REMOVING..." : "REMOVE GAME"}
      </button>
    {:else if onremovegame}
      <button class="modal-btn-danger" onclick={startRemove}>REMOVE GAME</button>
      <button class="modal-btn" onclick={() => onclose()}>DISMISS</button>
    {:else}
      <button class="modal-btn" onclick={() => onclose()}>DISMISS</button>
    {/if}
  {/snippet}
</Modal>

<!-- Stacked: source path editor -->
{#if editingSourceId}
  <SourceEditModal
    gameName={game.name}
    gameId={game.gameId}
    sourceId={editingSourceId}
    sourceName={editingSourceName ?? ""}
    initialPath={editingPath}
    {onsave}
    {ontestpath}
    {testPathResult}
    {validationState}
    {onremovesource}
    onclose={closeEditor}
  />
{/if}

<style>
  .saves-area {
    padding: 0;
  }

  .save-row-wrap {
    display: flex;
    align-items: center;
    border-bottom: 1px solid rgba(74, 90, 173, 0.06);
  }

  .save-row-wrap :global(.save-row) {
    border-bottom: none;
    flex: 1;
    min-width: 0;
  }

  .source-badge {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    letter-spacing: 0.5px;
    background: rgba(74, 90, 173, 0.08);
    padding: 2px 6px;
    border-radius: 2px;
    border: 1px solid rgba(74, 90, 173, 0.1);
    flex-shrink: 0;
    margin-right: 16px;
  }

  .empty-saves {
    padding: 32px 16px;
    text-align: center;
  }

  .empty-text {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-muted);
  }

  /* -- Sources section -- */

  .sources-section {
    border-top: 1px solid rgba(74, 90, 173, 0.1);
  }

  .sources-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 18px 8px;
  }

  .section-label {
    font-family: var(--font-pixel);
    font-size: 9px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .source-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 18px;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(74, 90, 173, 0.06);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .source-row:hover {
    background: rgba(74, 90, 173, 0.06);
  }

  .source-row-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .source-name {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text);
    letter-spacing: 0.5px;
  }

  .source-row-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-badge {
    font-family: var(--font-pixel);
    font-size: 8px;
    letter-spacing: 1px;
    padding: 2px 6px;
    border-radius: 2px;
  }

  .status-badge.watching {
    color: var(--color-green);
    background: rgba(90, 190, 138, 0.1);
    border: 1px solid rgba(90, 190, 138, 0.2);
  }

  .status-badge.error-status {
    color: var(--color-yellow);
    background: rgba(232, 180, 90, 0.1);
    border: 1px solid rgba(232, 180, 90, 0.2);
  }

  .status-badge.not-found {
    color: var(--color-text-muted);
    background: rgba(74, 90, 173, 0.06);
    border: 1px solid rgba(74, 90, 173, 0.1);
  }

  .status-badge.api-connected {
    color: var(--color-blue, #6ea8fe);
    background: rgba(110, 168, 254, 0.1);
    border: 1px solid rgba(110, 168, 254, 0.2);
  }

  .source-row.adapter-source {
    cursor: default;
  }

  .source-row.adapter-source:hover {
    background: none;
  }

  .source-path {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-dim);
    padding: 0 18px 8px 44px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .source-error {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-red, #e85a5a);
    padding: 0 18px 8px 44px;
  }

  /* -- Save remove button (hover reveal) -- */

  /* -- Removed saves section -- */

  .removed-section {
    border-top: 1px solid rgba(74, 90, 173, 0.1);
  }

  .removed-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 18px 8px;
  }

  .removed-count {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    background: rgba(74, 90, 173, 0.08);
    padding: 1px 5px;
    border-radius: 2px;
    border: 1px solid rgba(74, 90, 173, 0.1);
  }

  .removed-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 18px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.04);
    opacity: 0.6;
  }

  .removed-info {
    min-width: 0;
    flex: 1;
  }

  .removed-name {
    display: block;
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--color-text-dim);
    line-height: 1.2;
    text-decoration: line-through;
    text-decoration-color: rgba(74, 90, 173, 0.3);
  }

  .removed-summary {
    display: block;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
    line-height: 1.3;
    margin-top: 2px;
  }

  .removed-meta {
    display: flex;
    gap: 12px;
    margin-top: 4px;
  }

  .removed-date {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-muted);
    opacity: 0.7;
  }

  .removed-notes {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-gold);
    letter-spacing: 0.5px;
    align-self: center;
  }

  .restore-btn {
    font-family: var(--font-pixel);
    font-size: 8px;
    letter-spacing: 1px;
    color: var(--color-green);
    background: rgba(90, 190, 138, 0.08);
    border: 1px solid rgba(90, 190, 138, 0.2);
    padding: 4px 10px;
    border-radius: 2px;
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .restore-btn:hover {
    background: rgba(90, 190, 138, 0.15);
    border-color: rgba(90, 190, 138, 0.4);
  }

  .restore-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* -- Remove confirmation -- */

  .confirm-section {
    padding: 14px 18px;
    background: rgba(232, 90, 90, 0.04);
    border-top: 1px solid rgba(232, 90, 90, 0.12);
  }

  .confirm-warning {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
    line-height: 1.5;
    margin: 0 0 12px 0;
  }

  .confirm-warning strong {
    color: var(--color-text);
  }

  .confirm-prompt {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
    margin: 0 0 8px 0;
  }

  .confirm-prompt strong {
    color: var(--color-text);
  }

  .confirm-input {
    width: 100%;
    background: rgba(5, 7, 26, 0.6);
    border: 1px solid rgba(232, 90, 90, 0.25);
    border-radius: 3px;
    padding: 8px 10px;
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text);
    outline: none;
    box-sizing: border-box;
  }

  .confirm-input:focus {
    border-color: rgba(232, 90, 90, 0.5);
  }

  .confirm-input::placeholder {
    color: var(--color-text-muted);
    opacity: 0.4;
  }

  .confirm-input:disabled {
    opacity: 0.5;
  }

  .remove-error {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-red);
    margin: 8px 0 0 0;
  }
</style>
